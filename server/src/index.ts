import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { zValidator } from '@hono/zod-validator';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import {
  createHousehold,
  createSession,
  createUser,
  db,
  deleteSession,
  getSnapshot,
  getUserByEmail,
  getUserBySession,
  joinHousehold,
  logActivity,
} from './db.js';
import type { AuthUser, PlaceSuggestion, RoutineType } from '@shared/contracts';

type AppEnv = {
  Variables: {
    user: AuthUser | null;
  };
};

export const app = new Hono<AppEnv>();
const sessionCookieName = 'petcareloop_session';

app.use('*', async (c, next) => {
  const token = getCookie(c, sessionCookieName);
  c.set('user', token ? getUserBySession(token) : null);
  await next();
});

function requireUser(c: Context<AppEnv>) {
  const user = c.get('user');
  if (!user) {
    throw new HTTPException(401, { message: 'Authentication required.' });
  }
  return user;
}

function requireHousehold(user: AuthUser) {
  if (!user.householdId) {
    throw new HTTPException(400, { message: 'Join or create a household first.' });
  }
  return user.householdId;
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
}

function assertHouseholdPet(householdId: number, petId: number) {
  const pet = db
    .prepare('SELECT id, name FROM pets WHERE id = ? AND household_id = ?')
    .get(petId, householdId) as { id: number; name: string } | undefined;

  if (!pet) {
    throw new HTTPException(400, { message: 'Pet must belong to this household.' });
  }

  return pet;
}

function getHouseholdMemberName(householdId: number, memberId: number | null) {
  if (memberId === null) {
    return null;
  }

  const member = db
    .prepare('SELECT name FROM users WHERE id = ? AND household_id = ?')
    .get(memberId, householdId) as { name: string } | undefined;

  if (!member) {
    throw new HTTPException(400, { message: 'Assignee must be a member of this household.' });
  }

  return member.name;
}

function jsonError(error: unknown): { status: ContentfulStatusCode; body: { error: string } } {
  if (error instanceof HTTPException) {
    return { status: error.status, body: { error: error.message } };
  }

  if (error instanceof z.ZodError) {
    return {
      status: 400,
      body: { error: error.issues.map((issue) => issue.message).join(', ') },
    };
  }

  if (error instanceof Error) {
    return { status: 500, body: { error: error.message } };
  }

  return { status: 500, body: { error: 'Unexpected server error.' } };
}

app.onError((error, c) => {
  const result = jsonError(error);
  return c.json(result.body, { status: result.status });
});

const authSchema = z.object({
  name: z.string().min(2).max(60).optional(),
  email: z.string().email(),
  password: z.string().min(8).max(120),
});

app.post('/api/auth/register', zValidator('json', authSchema), async (c) => {
  const { name, email, password } = c.req.valid('json');
  if (!name) {
    return c.json({ error: 'Name is required.' }, 400);
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (getUserByEmail(normalizedEmail)) {
    return c.json({ error: 'Email already registered.' }, 409);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const userId = createUser({ name: name.trim(), email: normalizedEmail, passwordHash });
  const token = createSession(userId);
  setCookie(c, sessionCookieName, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 14,
  });
  return c.json({ user: getUserBySession(token) });
});

app.post('/api/auth/login', zValidator('json', authSchema.omit({ name: true })), async (c) => {
  const { email, password } = c.req.valid('json');
  const normalizedEmail = email.trim().toLowerCase();
  const existing = getUserByEmail(normalizedEmail);

  if (!existing) {
    return c.json({ error: 'Invalid email or password.' }, 401);
  }

  const valid = await bcrypt.compare(password, existing.passwordHash);
  if (!valid) {
    return c.json({ error: 'Invalid email or password.' }, 401);
  }

  const token = createSession(existing.id);
  setCookie(c, sessionCookieName, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 14,
  });
  return c.json({ user: getUserBySession(token) });
});

app.post('/api/auth/logout', (c) => {
  const token = getCookie(c, sessionCookieName);
  if (token) {
    deleteSession(token);
  }
  deleteCookie(c, sessionCookieName, { path: '/' });
  return c.json({ ok: true });
});

app.get('/api/auth/me', (c) => c.json({ user: c.get('user') }));

app.get('/api/app', (c) => {
  const user = requireUser(c);
  return c.json(getSnapshot(user));
});

const householdSchema = z.object({
  name: z.string().min(2).max(80),
});

app.post('/api/household/create', zValidator('json', householdSchema), (c) => {
  const user = requireUser(c);
  if (user.householdId) {
    return c.json({ error: 'You are already in a household.' }, 400);
  }

  const result = createHousehold({ ownerId: user.id, name: c.req.valid('json').name.trim() });
  const refreshed = getUserBySession(getCookie(c, sessionCookieName) ?? '');
  return c.json({ householdId: result.householdId, joinCode: result.joinCode, user: refreshed });
});

app.post(
  '/api/household/join',
  zValidator('json', z.object({ joinCode: z.string().min(4).max(12) })),
  (c) => {
    const user = requireUser(c);
    if (user.householdId) {
      return c.json({ error: 'You are already in a household.' }, 400);
    }

    const household = joinHousehold({
      userId: user.id,
      joinCode: c.req.valid('json').joinCode.trim().toUpperCase(),
    });

    if (!household) {
      return c.json({ error: 'Invite code not found.' }, 404);
    }

    const refreshed = getUserBySession(getCookie(c, sessionCookieName) ?? '');
    return c.json({ household, user: refreshed });
  },
);

const petSchema = z.object({
  name: z.string().min(1).max(60),
  species: z.string().min(1).max(40),
  breed: z.string().max(60).nullable(),
  ageSummary: z.string().max(40).nullable(),
  notes: z.string().max(260).nullable(),
  avatar: z.string().min(1).max(8),
});

app.post('/api/pets', zValidator('json', petSchema), (c) => {
  const user = requireUser(c);
  const householdId = requireHousehold(user);
  const input = c.req.valid('json');
  const petName = input.name.trim();

  const result = db
    .prepare(
      `INSERT INTO pets (household_id, name, species, breed, age_summary, notes, avatar)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      householdId,
      petName,
      input.species.trim(),
      normalizeOptionalText(input.breed),
      normalizeOptionalText(input.ageSummary),
      normalizeOptionalText(input.notes),
      input.avatar.trim(),
    );

  logActivity({
    householdId,
    actorId: user.id,
    action: 'added',
    entityType: 'pet',
    entityLabel: petName,
    details: `${input.species.trim()} profile created`,
  });

  return c.json({ id: Number(result.lastInsertRowid) });
});

app.put('/api/pets/:id', zValidator('json', petSchema), (c) => {
  const user = requireUser(c);
  const householdId = requireHousehold(user);
  const petId = Number(c.req.param('id'));
  assertHouseholdPet(householdId, petId);
  const input = c.req.valid('json');
  const petName = input.name.trim();

  db.prepare(
    `UPDATE pets
     SET name = ?, species = ?, breed = ?, age_summary = ?, notes = ?, avatar = ?
     WHERE id = ? AND household_id = ?`,
  ).run(
    petName,
    input.species.trim(),
    normalizeOptionalText(input.breed),
    normalizeOptionalText(input.ageSummary),
    normalizeOptionalText(input.notes),
    input.avatar.trim(),
    petId,
    householdId,
  );

  logActivity({
    householdId,
    actorId: user.id,
    action: 'updated',
    entityType: 'pet',
    entityLabel: petName,
  });

  return c.json({ ok: true });
});

app.delete('/api/pets/:id', (c) => {
  const user = requireUser(c);
  const householdId = requireHousehold(user);
  const petId = Number(c.req.param('id'));
  const pet = assertHouseholdPet(householdId, petId);
  db.prepare('DELETE FROM pets WHERE id = ? AND household_id = ?').run(petId, householdId);
  logActivity({
    householdId,
    actorId: user.id,
    action: 'removed',
    entityType: 'pet',
    entityLabel: pet.name,
  });
  return c.json({ ok: true });
});

const routineSchema = z.object({
  petId: z.number().int().positive(),
  title: z.string().min(2).max(80),
  routineType: z.enum(['feeding', 'walk', 'medication']),
  scheduleLabel: z.string().min(2).max(80),
  instructions: z.string().max(260).nullable(),
  assigneeId: z.number().int().positive().nullable(),
});

app.post('/api/routines', zValidator('json', routineSchema), (c) => {
  const user = requireUser(c);
  const householdId = requireHousehold(user);
  const input = c.req.valid('json');
  const pet = assertHouseholdPet(householdId, input.petId);
  const assigneeName = getHouseholdMemberName(householdId, input.assigneeId);
  const title = input.title.trim();

  const result = db
    .prepare(
      `INSERT INTO care_routines (household_id, pet_id, title, routine_type, schedule_label, instructions, assignee_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      householdId,
      input.petId,
      title,
      input.routineType,
      input.scheduleLabel.trim(),
      normalizeOptionalText(input.instructions),
      input.assigneeId,
    );

  logActivity({
    householdId,
    actorId: user.id,
    action: 'scheduled',
    entityType: 'routine',
    entityLabel: title,
    details: `${pet.name}${assigneeName ? ` assigned to ${assigneeName}` : ''}`,
  });

  return c.json({ id: Number(result.lastInsertRowid) });
});

app.put('/api/routines/:id', zValidator('json', routineSchema), (c) => {
  const user = requireUser(c);
  const householdId = requireHousehold(user);
  const routineId = Number(c.req.param('id'));
  const input = c.req.valid('json');
  const existing = db
    .prepare('SELECT id FROM care_routines WHERE id = ? AND household_id = ?')
    .get(routineId, householdId) as { id: number } | undefined;

  if (!existing) {
    return c.json({ error: 'Routine not found.' }, 404);
  }

  const pet = assertHouseholdPet(householdId, input.petId);
  const assigneeName = getHouseholdMemberName(householdId, input.assigneeId);
  const title = input.title.trim();

  db.prepare(
    `UPDATE care_routines
     SET pet_id = ?, title = ?, routine_type = ?, schedule_label = ?, instructions = ?, assignee_id = ?
     WHERE id = ? AND household_id = ?`,
  ).run(
    input.petId,
    title,
    input.routineType,
    input.scheduleLabel.trim(),
    normalizeOptionalText(input.instructions),
    input.assigneeId,
    routineId,
    householdId,
  );

  logActivity({
    householdId,
    actorId: user.id,
    action: 'updated',
    entityType: 'routine',
    entityLabel: title,
    details: `${pet.name}${assigneeName ? ` assigned to ${assigneeName}` : ''}`,
  });

  return c.json({ ok: true });
});

app.delete('/api/routines/:id', (c) => {
  const user = requireUser(c);
  const householdId = requireHousehold(user);
  const routineId = Number(c.req.param('id'));
  const row = db
    .prepare('SELECT title FROM care_routines WHERE id = ? AND household_id = ?')
    .get(routineId, householdId) as { title: string } | undefined;

  if (!row) {
    return c.json({ error: 'Routine not found.' }, 404);
  }

  db.prepare('DELETE FROM care_routines WHERE id = ? AND household_id = ?').run(routineId, householdId);
  logActivity({
    householdId,
    actorId: user.id,
    action: 'removed',
    entityType: 'routine',
    entityLabel: row.title,
  });
  return c.json({ ok: true });
});

const completeRoutineSchema = z.object({
  evidenceText: z.string().min(8).max(280),
});

app.post('/api/routines/:id/complete', zValidator('json', completeRoutineSchema), (c) => {
  const user = requireUser(c);
  const householdId = requireHousehold(user);
  const routineId = Number(c.req.param('id'));
  const routine = db
    .prepare(
      `SELECT r.id, r.pet_id as petId, p.name as petName, r.title, r.routine_type as routineType
       FROM care_routines r
       JOIN pets p ON p.id = r.pet_id
       WHERE r.id = ? AND r.household_id = ?`,
    )
    .get(routineId, householdId) as
    | { id: number; petId: number; petName: string; title: string; routineType: RoutineType }
    | undefined;

  if (!routine) {
    return c.json({ error: 'Routine not found.' }, 404);
  }

  const evidenceText = c.req.valid('json').evidenceText.trim();
  const result = db
    .prepare(
      `INSERT INTO care_logs
       (household_id, pet_id, routine_id, routine_title, routine_type, evidence_text, completed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(householdId, routine.petId, routine.id, routine.title, routine.routineType, evidenceText, user.id);

  db.prepare('UPDATE care_routines SET last_completed_at = CURRENT_TIMESTAMP WHERE id = ?').run(routineId);

  logActivity({
    householdId,
    actorId: user.id,
    action: 'completed',
    entityType: 'routine',
    entityLabel: routine.title,
    details: `${routine.petName}: ${evidenceText}`,
  });

  return c.json({ id: Number(result.lastInsertRowid) });
});

const careCommentSchema = z.object({
  body: z.string().min(2).max(220),
});

app.post('/api/care-logs/:id/comments', zValidator('json', careCommentSchema), (c) => {
  const user = requireUser(c);
  const householdId = requireHousehold(user);
  const careLogId = Number(c.req.param('id'));
  const row = db
    .prepare('SELECT routine_title as routineTitle FROM care_logs WHERE id = ? AND household_id = ?')
    .get(careLogId, householdId) as { routineTitle: string } | undefined;

  if (!row) {
    return c.json({ error: 'Care log not found.' }, 404);
  }

  const body = c.req.valid('json').body.trim();
  const result = db
    .prepare('INSERT INTO care_log_comments (care_log_id, author_id, body) VALUES (?, ?, ?)')
    .run(careLogId, user.id, body);

  logActivity({
    householdId,
    actorId: user.id,
    action: 'commented',
    entityType: 'care log',
    entityLabel: row.routineTitle,
    details: body,
  });

  return c.json({ id: Number(result.lastInsertRowid) });
});

const medicationSchema = z.object({
  petId: z.number().int().positive(),
  medicationName: z.string().min(2).max(80),
  onHand: z.number().min(0),
  unit: z.string().min(1).max(20),
  lowStockThreshold: z.number().min(0),
  dosageNotes: z.string().max(220).nullable(),
});

app.post('/api/medications', zValidator('json', medicationSchema), (c) => {
  const user = requireUser(c);
  const householdId = requireHousehold(user);
  const input = c.req.valid('json');
  const pet = assertHouseholdPet(householdId, input.petId);
  const medicationName = input.medicationName.trim();

  const result = db
    .prepare(
      `INSERT INTO medication_inventory
       (household_id, pet_id, medication_name, on_hand, unit, low_stock_threshold, dosage_notes, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      householdId,
      input.petId,
      medicationName,
      input.onHand,
      input.unit.trim(),
      input.lowStockThreshold,
      normalizeOptionalText(input.dosageNotes),
      user.id,
    );

  logActivity({
    householdId,
    actorId: user.id,
    action: 'tracked',
    entityType: 'medication',
    entityLabel: medicationName,
    details: `${pet.name}: ${input.onHand} ${input.unit.trim()} on hand`,
  });

  return c.json({ id: Number(result.lastInsertRowid) });
});

app.put('/api/medications/:id', zValidator('json', medicationSchema), (c) => {
  const user = requireUser(c);
  const householdId = requireHousehold(user);
  const medicationId = Number(c.req.param('id'));
  const input = c.req.valid('json');
  const existing = db
    .prepare('SELECT id FROM medication_inventory WHERE id = ? AND household_id = ?')
    .get(medicationId, householdId) as { id: number } | undefined;

  if (!existing) {
    return c.json({ error: 'Medication item not found.' }, 404);
  }

  const pet = assertHouseholdPet(householdId, input.petId);
  const medicationName = input.medicationName.trim();

  db.prepare(
    `UPDATE medication_inventory
     SET pet_id = ?, medication_name = ?, on_hand = ?, unit = ?, low_stock_threshold = ?, dosage_notes = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND household_id = ?`,
  ).run(
    input.petId,
    medicationName,
    input.onHand,
    input.unit.trim(),
    input.lowStockThreshold,
    normalizeOptionalText(input.dosageNotes),
    user.id,
    medicationId,
    householdId,
  );

  logActivity({
    householdId,
    actorId: user.id,
    action: 'updated',
    entityType: 'medication',
    entityLabel: medicationName,
    details: `${pet.name}: ${input.onHand} ${input.unit.trim()} on hand`,
  });

  return c.json({ ok: true });
});

app.delete('/api/medications/:id', (c) => {
  const user = requireUser(c);
  const householdId = requireHousehold(user);
  const medicationId = Number(c.req.param('id'));
  const row = db
    .prepare('SELECT medication_name as medicationName FROM medication_inventory WHERE id = ? AND household_id = ?')
    .get(medicationId, householdId) as { medicationName: string } | undefined;

  if (!row) {
    return c.json({ error: 'Medication item not found.' }, 404);
  }

  db.prepare('DELETE FROM medication_inventory WHERE id = ? AND household_id = ?').run(medicationId, householdId);
  logActivity({
    householdId,
    actorId: user.id,
    action: 'removed',
    entityType: 'medication',
    entityLabel: row.medicationName,
  });
  return c.json({ ok: true });
});

const appointmentSchema = z.object({
  petId: z.number().int().positive(),
  title: z.string().min(2).max(80),
  appointmentAt: z.string().min(16).max(32),
  placeName: z.string().min(2).max(120),
  address: z.string().max(220).nullable(),
  notes: z.string().max(260).nullable(),
});

app.post('/api/appointments', zValidator('json', appointmentSchema), (c) => {
  const user = requireUser(c);
  const householdId = requireHousehold(user);
  const input = c.req.valid('json');
  const pet = assertHouseholdPet(householdId, input.petId);
  const title = input.title.trim();

  const result = db
    .prepare(
      `INSERT INTO vet_appointments
       (household_id, pet_id, title, appointment_at, place_name, address, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      householdId,
      input.petId,
      title,
      input.appointmentAt,
      input.placeName.trim(),
      normalizeOptionalText(input.address),
      normalizeOptionalText(input.notes),
      user.id,
    );

  logActivity({
    householdId,
    actorId: user.id,
    action: 'planned',
    entityType: 'appointment',
    entityLabel: title,
    details: `${pet.name} at ${input.placeName.trim()}`,
  });

  return c.json({ id: Number(result.lastInsertRowid) });
});

app.put('/api/appointments/:id', zValidator('json', appointmentSchema), (c) => {
  const user = requireUser(c);
  const householdId = requireHousehold(user);
  const appointmentId = Number(c.req.param('id'));
  const input = c.req.valid('json');
  const existing = db
    .prepare('SELECT id FROM vet_appointments WHERE id = ? AND household_id = ?')
    .get(appointmentId, householdId) as { id: number } | undefined;

  if (!existing) {
    return c.json({ error: 'Appointment not found.' }, 404);
  }

  const pet = assertHouseholdPet(householdId, input.petId);
  const title = input.title.trim();

  db.prepare(
    `UPDATE vet_appointments
     SET pet_id = ?, title = ?, appointment_at = ?, place_name = ?, address = ?, notes = ?, created_by = ?
     WHERE id = ? AND household_id = ?`,
  ).run(
    input.petId,
    title,
    input.appointmentAt,
    input.placeName.trim(),
    normalizeOptionalText(input.address),
    normalizeOptionalText(input.notes),
    user.id,
    appointmentId,
    householdId,
  );

  logActivity({
    householdId,
    actorId: user.id,
    action: 'updated',
    entityType: 'appointment',
    entityLabel: title,
    details: `${pet.name} at ${input.placeName.trim()}`,
  });

  return c.json({ ok: true });
});

app.delete('/api/appointments/:id', (c) => {
  const user = requireUser(c);
  const householdId = requireHousehold(user);
  const appointmentId = Number(c.req.param('id'));
  const row = db
    .prepare('SELECT title FROM vet_appointments WHERE id = ? AND household_id = ?')
    .get(appointmentId, householdId) as { title: string } | undefined;

  if (!row) {
    return c.json({ error: 'Appointment not found.' }, 404);
  }

  db.prepare('DELETE FROM vet_appointments WHERE id = ? AND household_id = ?').run(appointmentId, householdId);
  logActivity({
    householdId,
    actorId: user.id,
    action: 'removed',
    entityType: 'appointment',
    entityLabel: row.title,
  });
  return c.json({ ok: true });
});

app.get('/api/places/search', async (c) => {
  requireUser(c);
  const query = c.req.query('q')?.trim() ?? '';

  if (query.length < 3) {
    return c.json({ results: [] satisfies PlaceSuggestion[] });
  }

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '5');
  url.searchParams.set('addressdetails', '1');

  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'PetCareLoop/058',
    },
  }).catch(() => null);

  if (!response?.ok) {
    return c.json({ results: [] satisfies PlaceSuggestion[] });
  }

  const raw = (await response.json()) as Array<{
    display_name: string;
    name?: string;
    lat: string;
    lon: string;
  }>;

  const results: PlaceSuggestion[] = raw.map((item) => ({
    label: item.display_name,
    name: item.name?.trim() || item.display_name.split(',')[0] || 'Vet clinic',
    address: item.display_name,
    latitude: item.lat,
    longitude: item.lon,
  }));

  return c.json({ results });
});

const staticRoot = './dist/public';
app.use('/*', serveStatic({ root: staticRoot, rewriteRequestPath: (pathValue) => pathValue }));

app.get('*', async (c) => {
  if (c.req.path.startsWith('/api')) {
    return c.json({ error: 'Not found.' }, 404);
  }
  const html = await readFile(path.join(process.cwd(), 'dist/public/index.html'), 'utf8');
  return c.html(html);
});

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const modulePath = fileURLToPath(import.meta.url);

if (entryPath === modulePath) {
  const port = Number(process.env.PORT ?? 3000);
  serve({
    fetch: app.fetch,
    port,
  });

  console.log(`PetCareLoop listening on http://localhost:${port}`);
}
