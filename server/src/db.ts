import Database from 'better-sqlite3';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import type {
  ActivityEvent,
  AppSnapshot,
  AuthUser,
  CareLogComment,
  CareLogEntry,
  CareRoutine,
  HouseholdMember,
  MedicationInventoryItem,
  PetProfile,
  RoutineType,
  VetAppointment,
} from '@shared/contracts';

const dataDir = path.resolve(process.cwd(), 'data');
mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, 'petcareloop.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS households (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    join_code TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    household_id INTEGER REFERENCES households(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS pets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    species TEXT NOT NULL,
    breed TEXT,
    age_summary TEXT,
    notes TEXT,
    avatar TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS care_routines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    routine_type TEXT NOT NULL,
    schedule_label TEXT NOT NULL,
    instructions TEXT,
    assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    last_completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS care_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    routine_id INTEGER REFERENCES care_routines(id) ON DELETE SET NULL,
    routine_title TEXT NOT NULL,
    routine_type TEXT NOT NULL,
    evidence_text TEXT NOT NULL,
    completed_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS care_log_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    care_log_id INTEGER NOT NULL REFERENCES care_logs(id) ON DELETE CASCADE,
    author_id INTEGER NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS medication_inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    medication_name TEXT NOT NULL,
    on_hand REAL NOT NULL,
    unit TEXT NOT NULL,
    low_stock_threshold REAL NOT NULL,
    dosage_notes TEXT,
    updated_by INTEGER NOT NULL REFERENCES users(id),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS vet_appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    appointment_at TEXT NOT NULL,
    place_name TEXT NOT NULL,
    address TEXT,
    notes TEXT,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    actor_id INTEGER NOT NULL REFERENCES users(id),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_label TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

type UserRow = {
  id: number;
  name: string;
  email: string;
  householdId: number | null;
  householdName: string | null;
  joinCode: string | null;
};

type LogCommentRow = {
  id: number;
  careLogId: number;
  authorName: string;
  body: string;
  createdAt: string;
};

export function generateJoinCode() {
  return randomBytes(3).toString('hex').toUpperCase();
}

export function createSession(userId: number) {
  const token = randomBytes(24).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId);
  return token;
}

export function deleteSession(token: string) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function getUserBySession(token: string): AuthUser | null {
  const row = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.household_id as householdId, h.name as householdName, h.join_code as joinCode
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN households h ON h.id = u.household_id
       WHERE s.token = ?`,
    )
    .get(token) as UserRow | undefined;

  return row ?? null;
}

export function getUserByEmail(email: string) {
  return db
    .prepare('SELECT id, name, email, password_hash as passwordHash, household_id as householdId FROM users WHERE email = ?')
    .get(email) as
    | { id: number; name: string; email: string; passwordHash: string; householdId: number | null }
    | undefined;
}

export function createUser(input: { name: string; email: string; passwordHash: string }) {
  const result = db
    .prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
    .run(input.name, input.email, input.passwordHash);
  return Number(result.lastInsertRowid);
}

function seedHouseholdDemoData(householdId: number, ownerId: number) {
  const pet = db
    .prepare(
      `INSERT INTO pets (household_id, name, species, breed, age_summary, notes, avatar)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      householdId,
      'Mochi',
      'Dog',
      'Corgi mix',
      '4 years',
      'Prefers a slower evening walk and takes meds with dinner.',
      '🐶',
    );
  const petId = Number(pet.lastInsertRowid);

  const routines = [
    ['Breakfast feeding', 'feeding', 'Daily at 7:30 AM', '1 cup dry food and refresh the water bowl.'],
    ['Neighborhood walk', 'walk', 'Daily at 6:30 PM', '20 minute loop and note any limping or fatigue.'],
    ['Arthritis medication', 'medication', 'Daily with dinner', 'Hide one chewable tablet in food.'],
  ] as Array<[string, RoutineType, string, string]>;

  for (const [title, routineType, scheduleLabel, instructions] of routines) {
    db.prepare(
      `INSERT INTO care_routines (household_id, pet_id, title, routine_type, schedule_label, instructions, assignee_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(householdId, petId, title, routineType, scheduleLabel, instructions, ownerId);
  }

  db.prepare(
    `INSERT INTO medication_inventory
     (household_id, pet_id, medication_name, on_hand, unit, low_stock_threshold, dosage_notes, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(householdId, petId, 'Carprofen', 6, 'tablets', 4, 'Give one tablet with dinner.', ownerId);

  db.prepare(
    `INSERT INTO vet_appointments
     (household_id, pet_id, title, appointment_at, place_name, address, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    householdId,
    petId,
    'Quarterly mobility check',
    '2026-04-22T16:00',
    'Greenfield Vet Clinic',
    '123 Garden Ave',
    'Bring the current medication bottle and mention recent stiffness.',
    ownerId,
  );

  const firstRoutine = db
    .prepare('SELECT id, title, routine_type as routineType FROM care_routines WHERE household_id = ? ORDER BY id ASC LIMIT 1')
    .get(householdId) as { id: number; title: string; routineType: RoutineType } | undefined;

  if (firstRoutine) {
    const careLogId = Number(
      db
        .prepare(
          `INSERT INTO care_logs
           (household_id, pet_id, routine_id, routine_title, routine_type, evidence_text, completed_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          householdId,
          petId,
          firstRoutine.id,
          firstRoutine.title,
          firstRoutine.routineType,
          'Finished breakfast and refreshed the water bowl at 7:34 AM.',
          ownerId,
        ).lastInsertRowid,
    );

    db.prepare('UPDATE care_routines SET last_completed_at = CURRENT_TIMESTAMP WHERE id = ?').run(firstRoutine.id);
    db.prepare('INSERT INTO care_log_comments (care_log_id, author_id, body) VALUES (?, ?, ?)').run(
      careLogId,
      ownerId,
      'Mochi ate right away and had normal energy afterward.',
    );
  }
}

export function createHousehold(input: { ownerId: number; name: string }) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const joinCode = generateJoinCode();
    try {
      const tx = db.transaction(() => {
        const household = db
          .prepare('INSERT INTO households (name, join_code) VALUES (?, ?)')
          .run(input.name, joinCode);
        const householdId = Number(household.lastInsertRowid);
        db.prepare('UPDATE users SET household_id = ? WHERE id = ?').run(householdId, input.ownerId);
        seedHouseholdDemoData(householdId, input.ownerId);
        logActivity({
          householdId,
          actorId: input.ownerId,
          action: 'created',
          entityType: 'household',
          entityLabel: input.name,
          details: `Invite code ${joinCode}`,
        });
        return householdId;
      });

      return { householdId: tx(), joinCode };
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE')) {
        continue;
      }
      throw error;
    }
  }

  throw new Error('Unable to allocate a unique household invite code.');
}

export function joinHousehold(input: { userId: number; joinCode: string }) {
  const household = db
    .prepare('SELECT id, name, join_code as joinCode FROM households WHERE join_code = ?')
    .get(input.joinCode) as { id: number; name: string; joinCode: string } | undefined;
  if (!household) {
    return null;
  }
  db.prepare('UPDATE users SET household_id = ? WHERE id = ?').run(household.id, input.userId);
  const actor = db.prepare('SELECT name FROM users WHERE id = ?').get(input.userId) as { name: string };
  logActivity({
    householdId: household.id,
    actorId: input.userId,
    action: 'joined',
    entityType: 'household',
    entityLabel: household.name,
    details: `${actor.name} joined via code ${household.joinCode}`,
  });
  return household;
}

export function logActivity(input: {
  householdId: number;
  actorId: number;
  action: string;
  entityType: string;
  entityLabel: string;
  details?: string | null;
}) {
  db.prepare(
    `INSERT INTO activity_log (household_id, actor_id, action, entity_type, entity_label, details)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(input.householdId, input.actorId, input.action, input.entityType, input.entityLabel, input.details ?? null);
}

export function getMembers(householdId: number) {
  return db
    .prepare('SELECT id, name, email FROM users WHERE household_id = ? ORDER BY name ASC')
    .all(householdId) as HouseholdMember[];
}

export function getSnapshot(user: AuthUser): AppSnapshot {
  if (!user.householdId) {
    return {
      user,
      members: [],
      pets: [],
      routines: [],
      careLogs: [],
      medicationInventory: [],
      lowStockAlerts: [],
      vetAppointments: [],
      activity: [],
    };
  }

  const pets = db
    .prepare(
      `SELECT id, name, species, breed, age_summary as ageSummary, notes, avatar, created_at as createdAt
       FROM pets
       WHERE household_id = ?
       ORDER BY name ASC`,
    )
    .all(user.householdId) as PetProfile[];

  const routines = db
    .prepare(
      `SELECT r.id, r.pet_id as petId, r.title, r.routine_type as routineType, r.schedule_label as scheduleLabel,
              r.instructions, r.assignee_id as assigneeId, u.name as assigneeName, r.last_completed_at as lastCompletedAt
       FROM care_routines r
       LEFT JOIN users u ON u.id = r.assignee_id
       WHERE r.household_id = ?
       ORDER BY r.routine_type ASC, r.title ASC`,
    )
    .all(user.householdId) as CareRoutine[];

  const logRows = db
    .prepare(
      `SELECT l.id, l.pet_id as petId, p.name as petName, l.routine_id as routineId, l.routine_title as routineTitle,
              l.routine_type as routineType, u.name as completedByName, l.evidence_text as evidenceText, l.created_at as createdAt
       FROM care_logs l
       JOIN pets p ON p.id = l.pet_id
       JOIN users u ON u.id = l.completed_by
       WHERE l.household_id = ?
       ORDER BY l.created_at DESC, l.id DESC
       LIMIT 30`,
    )
    .all(user.householdId) as Omit<CareLogEntry, 'comments'>[];

  const commentRows = db
    .prepare(
      `SELECT c.id, c.care_log_id as careLogId, u.name as authorName, c.body, c.created_at as createdAt
       FROM care_log_comments c
       JOIN care_logs l ON l.id = c.care_log_id
       JOIN users u ON u.id = c.author_id
       WHERE l.household_id = ?
       ORDER BY c.created_at ASC, c.id ASC`,
    )
    .all(user.householdId) as LogCommentRow[];

  const commentsByLog = commentRows.reduce<Record<number, CareLogComment[]>>((acc, comment) => {
    acc[comment.careLogId] ??= [];
    acc[comment.careLogId].push({
      id: comment.id,
      authorName: comment.authorName,
      body: comment.body,
      createdAt: comment.createdAt,
    });
    return acc;
  }, {});

  const careLogs: CareLogEntry[] = logRows.map((row) => ({
    ...row,
    comments: commentsByLog[row.id] ?? [],
  }));

  const medicationInventory = db
    .prepare(
      `SELECT m.id, m.pet_id as petId, p.name as petName, m.medication_name as medicationName, m.on_hand as onHand,
              m.unit, m.low_stock_threshold as lowStockThreshold, m.dosage_notes as dosageNotes, m.updated_at as updatedAt,
              u.name as updatedByName
       FROM medication_inventory m
       JOIN pets p ON p.id = m.pet_id
       JOIN users u ON u.id = m.updated_by
       WHERE m.household_id = ?
       ORDER BY CASE WHEN m.on_hand <= m.low_stock_threshold THEN 0 ELSE 1 END, p.name ASC, m.medication_name ASC`,
    )
    .all(user.householdId) as MedicationInventoryItem[];

  const vetAppointments = db
    .prepare(
      `SELECT v.id, v.pet_id as petId, p.name as petName, v.title, v.appointment_at as appointmentAt, v.place_name as placeName,
              v.address, v.notes, u.name as createdByName
       FROM vet_appointments v
       JOIN pets p ON p.id = v.pet_id
       JOIN users u ON u.id = v.created_by
       WHERE v.household_id = ?
       ORDER BY v.appointment_at ASC`,
    )
    .all(user.householdId) as VetAppointment[];

  const activity = db
    .prepare(
      `SELECT a.id, u.name as actorName, a.action, a.entity_type as entityType, a.entity_label as entityLabel,
              a.details, a.created_at as createdAt
       FROM activity_log a
       JOIN users u ON u.id = a.actor_id
       WHERE a.household_id = ?
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT 40`,
    )
    .all(user.householdId) as ActivityEvent[];

  return {
    user,
    members: getMembers(user.householdId),
    pets,
    routines,
    careLogs,
    medicationInventory,
    lowStockAlerts: medicationInventory.filter((item) => item.onHand <= item.lowStockThreshold),
    vetAppointments,
    activity,
  };
}
