import type { FormEvent, ReactNode } from 'react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  HeartPulse,
  MapPinned,
  MessageSquare,
  MoonStar,
  PawPrint,
  Pill,
  ShieldCheck,
  Syringe,
  Users,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import type {
  AppSnapshot,
  AuthUser,
  CareLogEntry,
  CareRoutine,
  HouseholdMember,
  MedicationInventoryItem,
  PetProfile,
  PlaceSuggestion,
  RoutineType,
  VetAppointment,
} from '@shared/contracts';
import { api } from './api';

const avatars = ['🐶', '🐱', '🐰', '🐾', '🦴', '🐕', '🐈'];
const routineOptions: Array<{ value: RoutineType; label: string }> = [
  { value: 'feeding', label: 'Feeding' },
  { value: 'walk', label: 'Walk' },
  { value: 'medication', label: 'Medication' },
];

type PetDraft = {
  name: string;
  species: string;
  breed: string;
  ageSummary: string;
  notes: string;
  avatar: string;
};

type RoutineDraft = {
  petId: number;
  title: string;
  routineType: RoutineType;
  scheduleLabel: string;
  instructions: string;
  assigneeId: number | null;
};

type MedicationDraft = {
  petId: number;
  medicationName: string;
  onHand: number;
  unit: string;
  lowStockThreshold: number;
  dosageNotes: string;
};

type AppointmentDraft = {
  petId: number;
  title: string;
  appointmentAt: string;
  placeName: string;
  address: string;
  notes: string;
  placeQuery: string;
};

const defaultPetDraft: PetDraft = {
  name: '',
  species: '',
  breed: '',
  ageSummary: '',
  notes: '',
  avatar: avatars[0],
};

const defaultRoutineDraft = (petId: number): RoutineDraft => ({
  petId,
  title: '',
  routineType: 'feeding',
  scheduleLabel: '',
  instructions: '',
  assigneeId: null,
});

const defaultMedicationDraft = (petId: number): MedicationDraft => ({
  petId,
  medicationName: '',
  onHand: 0,
  unit: 'tablets',
  lowStockThreshold: 0,
  dosageNotes: '',
});

const defaultAppointmentDraft = (petId: number): AppointmentDraft => ({
  petId,
  title: '',
  appointmentAt: '',
  placeName: '',
  address: '',
  notes: '',
  placeQuery: '',
});

export function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [householdForm, setHouseholdForm] = useState({ name: '', joinCode: '' });
  const [petDraft, setPetDraft] = useState<PetDraft>(defaultPetDraft);
  const [routineDraft, setRoutineDraft] = useState<RoutineDraft>(defaultRoutineDraft(0));
  const [medicationDraft, setMedicationDraft] = useState<MedicationDraft>(defaultMedicationDraft(0));
  const [appointmentDraft, setAppointmentDraft] = useState<AppointmentDraft>(defaultAppointmentDraft(0));
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceSuggestion[]>([]);
  const [editingPetId, setEditingPetId] = useState<number | null>(null);
  const [editingRoutineId, setEditingRoutineId] = useState<number | null>(null);
  const [editingMedicationId, setEditingMedicationId] = useState<number | null>(null);
  const [editingAppointmentId, setEditingAppointmentId] = useState<number | null>(null);
  const [evidenceDrafts, setEvidenceDrafts] = useState<Record<number, string>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const deferredPlaceQuery = useDeferredValue(appointmentDraft.placeQuery);
  const members = snapshot?.members ?? [];
  const pets = snapshot?.pets ?? [];
  const selectedPetId = pets[0]?.id ?? 0;

  useEffect(() => {
    api
      .me()
      .then(async ({ user: nextUser }) => {
        setUser(nextUser);
        if (nextUser?.householdId) {
          const appData = await api.app();
          hydrateApp(appData);
        }
      })
      .catch((nextError: Error) => setError(nextError.message));
  }, []);

  useEffect(() => {
    if (!user?.householdId || deferredPlaceQuery.trim().length < 3) {
      setPlaceSuggestions([]);
      return;
    }

    let cancelled = false;
    api
      .searchPlaces(deferredPlaceQuery.trim())
      .then(({ results }) => {
        if (!cancelled) {
          setPlaceSuggestions(results);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPlaceSuggestions([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [deferredPlaceQuery, user?.householdId]);

  const routinesByPet = useMemo(() => {
    const entries = new Map<number, CareRoutine[]>();
    for (const routine of snapshot?.routines ?? []) {
      const list = entries.get(routine.petId) ?? [];
      list.push(routine);
      entries.set(routine.petId, list);
    }
    return entries;
  }, [snapshot?.routines]);

  function hydrateApp(data: AppSnapshot) {
    setSnapshot(data);
    setUser(data.user);
    const firstPetId = data.pets[0]?.id ?? 0;
    setRoutineDraft((current) => ({ ...current, petId: current.petId || firstPetId }));
    setMedicationDraft((current) => ({ ...current, petId: current.petId || firstPetId }));
    setAppointmentDraft((current) => ({ ...current, petId: current.petId || firstPetId }));
  }

  async function refreshApp() {
    const data = await api.app();
    hydrateApp(data);
    setEvidenceDrafts({});
    setCommentDrafts({});
  }

  function resetPetForm() {
    setPetDraft(defaultPetDraft);
    setEditingPetId(null);
  }

  function resetRoutineForm(nextPetId = pets[0]?.id ?? 0) {
    setRoutineDraft(defaultRoutineDraft(nextPetId));
    setEditingRoutineId(null);
  }

  function resetMedicationForm(nextPetId = pets[0]?.id ?? 0) {
    setMedicationDraft(defaultMedicationDraft(nextPetId));
    setEditingMedicationId(null);
  }

  function resetAppointmentForm(nextPetId = pets[0]?.id ?? 0) {
    setAppointmentDraft(defaultAppointmentDraft(nextPetId));
    setEditingAppointmentId(null);
    setPlaceSuggestions([]);
  }

  async function runAction(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await work();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Request failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleAuthSubmit(event: FormEvent) {
    event.preventDefault();
    await runAction(async () => {
      const response =
        mode === 'register'
          ? await api.register(authForm)
          : await api.login({ email: authForm.email, password: authForm.password });

      setUser(response.user);
      setSnapshot(null);
      setAuthForm({ name: '', email: '', password: '' });

      if (response.user?.householdId) {
        await refreshApp();
      } else {
        setInfo(mode === 'register' ? 'Account created. Start by creating or joining a household.' : 'Signed in.');
      }
    });
  }

  async function handleCreateHousehold(event: FormEvent) {
    event.preventDefault();
    await runAction(async () => {
      const response = await api.createHousehold({ name: householdForm.name });
      setUser(response.user);
      setHouseholdForm((current) => ({ ...current, name: '' }));
      setInfo(`Household created. Share invite code ${response.joinCode}.`);
      await refreshApp();
    });
  }

  async function handleJoinHousehold(event: FormEvent) {
    event.preventDefault();
    await runAction(async () => {
      const joinCode = householdForm.joinCode.trim().toUpperCase();
      const response = await api.joinHousehold({ joinCode });
      setUser(response.user);
      setHouseholdForm((current) => ({ ...current, joinCode: '' }));
      setInfo(`Joined household ${joinCode}.`);
      await refreshApp();
    });
  }

  async function handlePetSubmit(event: FormEvent) {
    event.preventDefault();
    const payload = {
      ...petDraft,
      breed: petDraft.breed.trim() || null,
      ageSummary: petDraft.ageSummary.trim() || null,
      notes: petDraft.notes.trim() || null,
    };

    await runAction(async () => {
      if (editingPetId) {
        await api.updatePet(editingPetId, payload);
        setInfo(`Updated ${petDraft.name}.`);
      } else {
        await api.createPet(payload);
        setInfo(`Added ${petDraft.name}.`);
      }
      resetPetForm();
      await refreshApp();
    });
  }

  async function handleRoutineSubmit(event: FormEvent) {
    event.preventDefault();
    const payload = {
      ...routineDraft,
      instructions: routineDraft.instructions.trim() || null,
    };

    await runAction(async () => {
      if (editingRoutineId) {
        await api.updateRoutine(editingRoutineId, payload);
        setInfo(`Updated ${routineDraft.title}.`);
      } else {
        await api.createRoutine(payload);
        setInfo(`Scheduled ${routineDraft.title}.`);
      }
      resetRoutineForm(routineDraft.petId);
      await refreshApp();
    });
  }

  async function handleMedicationSubmit(event: FormEvent) {
    event.preventDefault();
    const payload = {
      ...medicationDraft,
      dosageNotes: medicationDraft.dosageNotes.trim() || null,
    };

    await runAction(async () => {
      if (editingMedicationId) {
        await api.updateMedication(editingMedicationId, payload);
        setInfo(`Updated ${medicationDraft.medicationName}.`);
      } else {
        await api.createMedication(payload);
        setInfo(`Tracked ${medicationDraft.medicationName}.`);
      }
      resetMedicationForm(medicationDraft.petId);
      await refreshApp();
    });
  }

  async function handleAppointmentSubmit(event: FormEvent) {
    event.preventDefault();
    const payload = {
      ...appointmentDraft,
      address: appointmentDraft.address.trim() || null,
      notes: appointmentDraft.notes.trim() || null,
    };

    await runAction(async () => {
      if (editingAppointmentId) {
        await api.updateAppointment(editingAppointmentId, payload);
        setInfo(`Updated ${appointmentDraft.title}.`);
      } else {
        await api.createAppointment(payload);
        setInfo(`Planned ${appointmentDraft.title}.`);
      }
      resetAppointmentForm(appointmentDraft.petId);
      await refreshApp();
    });
  }

  async function handleCompleteRoutine(routine: CareRoutine) {
    const evidenceText = (evidenceDrafts[routine.id] ?? '').trim();
    if (!evidenceText) {
      setError('Add completion evidence before closing a routine.');
      return;
    }

    await runAction(async () => {
      await api.completeRoutine(routine.id, { evidenceText });
      setInfo(`${routine.title} logged.`);
      await refreshApp();
    });
  }

  async function handleAddComment(log: CareLogEntry) {
    const body = (commentDrafts[log.id] ?? '').trim();
    if (!body) {
      setError('Write a short comment before posting.');
      return;
    }

    await runAction(async () => {
      await api.addCareLogComment(log.id, { body });
      setInfo(`Comment added to ${log.routineTitle}.`);
      await refreshApp();
    });
  }

  async function handleLogout() {
    await runAction(async () => {
      await api.logout();
      setUser(null);
      setSnapshot(null);
      setHouseholdForm({ name: '', joinCode: '' });
      resetPetForm();
      resetRoutineForm();
      resetMedicationForm();
      resetAppointmentForm();
      setInfo(null);
    });
  }

  function startEditingPet(pet: PetProfile) {
    setEditingPetId(pet.id);
    setPetDraft({
      name: pet.name,
      species: pet.species,
      breed: pet.breed ?? '',
      ageSummary: pet.ageSummary ?? '',
      notes: pet.notes ?? '',
      avatar: pet.avatar,
    });
  }

  function startEditingRoutine(routine: CareRoutine) {
    setEditingRoutineId(routine.id);
    setRoutineDraft({
      petId: routine.petId,
      title: routine.title,
      routineType: routine.routineType,
      scheduleLabel: routine.scheduleLabel,
      instructions: routine.instructions ?? '',
      assigneeId: routine.assigneeId,
    });
  }

  function startEditingMedication(item: MedicationInventoryItem) {
    setEditingMedicationId(item.id);
    setMedicationDraft({
      petId: item.petId,
      medicationName: item.medicationName,
      onHand: item.onHand,
      unit: item.unit,
      lowStockThreshold: item.lowStockThreshold,
      dosageNotes: item.dosageNotes ?? '',
    });
  }

  function startEditingAppointment(item: VetAppointment) {
    setEditingAppointmentId(item.id);
    setAppointmentDraft({
      petId: item.petId,
      title: item.title,
      appointmentAt: item.appointmentAt.slice(0, 16),
      placeName: item.placeName,
      address: item.address ?? '',
      notes: item.notes ?? '',
      placeQuery: item.placeName,
    });
  }

  const lowStockCount = snapshot?.lowStockAlerts.length ?? 0;
  const careLogCount = snapshot?.careLogs.length ?? 0;
  const routineCount = snapshot?.routines.length ?? 0;
  const appointmentCount = snapshot?.vetAppointments.length ?? 0;

  return (
    <div className="min-h-screen bg-night text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(132,249,203,0.16),_transparent_26%),radial-gradient(circle_at_top_right,_rgba(255,146,146,0.14),_transparent_24%),radial-gradient(circle_at_bottom,_rgba(104,136,255,0.12),_transparent_30%)]" />
      <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 overflow-hidden rounded-[2rem] border border-white/10 bg-panel/80 shadow-panel backdrop-blur-xl">
          <div className="grid gap-6 p-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.32em] text-teal-200/80">
                <span>Nightshift Build 058</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-300">
                  Collaborative pet-care workspace
                </span>
              </div>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">PetCareLoop</h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                Shared households, assigned care routines, a commentable care timeline, medication stock alerts, and
                vet planning in a single durable dark-mode workspace.
              </p>
              <div className="mt-5 flex flex-wrap gap-3 text-sm text-slate-300">
                <Badge icon={<ShieldCheck size={14} />} label="Real session auth" />
                <Badge icon={<Users size={14} />} label="Invite code onboarding" />
                <Badge icon={<MoonStar size={14} />} label="Dark-mode-first UI" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <StatPill icon={<PawPrint size={16} />} label="Pets" value={String(snapshot?.pets.length ?? 0)} />
              <StatPill icon={<HeartPulse size={16} />} label="Routines" value={String(routineCount)} />
              <StatPill icon={<MessageSquare size={16} />} label="Care Logs" value={String(careLogCount)} />
              <StatPill icon={<Pill size={16} />} label="Low Stock" value={String(lowStockCount)} />
              <StatPill icon={<CalendarDays size={16} />} label="Appointments" value={String(appointmentCount)} />
              <StatPill icon={<Users size={16} />} label="Members" value={String(snapshot?.members.length ?? 0)} />
            </div>
          </div>
        </header>

        {error ? <Banner tone="error" message={error} /> : null}
        {info ? <Banner tone="info" message={info} /> : null}

        {!user ? (
          <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <Panel title="What PetCareLoop Covers" icon={<PawPrint size={18} />}>
              <div className="grid gap-4 sm:grid-cols-3">
                <FeatureCard
                  icon={<Users size={18} />}
                  title="Household setup"
                  text="Create a household, share an invite code, and bring partners, roommates, or sitters into the same pet workspace."
                />
                <FeatureCard
                  icon={<HeartPulse size={18} />}
                  title="Care workflow"
                  text="Assign feeding, walk, and medication routines to members, then close the loop with evidence text and timeline comments."
                />
                <FeatureCard
                  icon={<Syringe size={18} />}
                  title="Health planning"
                  text="Track medication stock with low-stock alerts and book vet appointments with live place lookup."
                />
              </div>
            </Panel>

            <form onSubmit={handleAuthSubmit} className="rounded-[2rem] border border-white/10 bg-panel/80 p-6 shadow-panel">
              <div className="mb-5 flex gap-2 rounded-full border border-white/10 bg-white/5 p-1">
                <button type="button" onClick={() => setMode('register')} className={tabClass(mode === 'register')}>
                  Register
                </button>
                <button type="button" onClick={() => setMode('login')} className={tabClass(mode === 'login')}>
                  Login
                </button>
              </div>

              <div className="grid gap-4">
                {mode === 'register' ? (
                  <Field label="Full name">
                    <input
                      className={inputClass}
                      required
                      value={authForm.name}
                      onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })}
                    />
                  </Field>
                ) : null}

                <Field label="Email">
                  <input
                    className={inputClass}
                    required
                    type="email"
                    value={authForm.email}
                    onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })}
                  />
                </Field>

                <Field label="Password">
                  <input
                    className={inputClass}
                    required
                    type="password"
                    minLength={8}
                    value={authForm.password}
                    onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })}
                  />
                </Field>

                <button disabled={busy} className={primaryButton}>
                  {busy ? 'Working...' : mode === 'register' ? 'Create account' : 'Sign in'}
                </button>
              </div>
            </form>
          </section>
        ) : !user.householdId ? (
          <section className="grid gap-6 xl:grid-cols-[1fr_1fr_0.9fr]">
            <Panel title="Create Household" icon={<Users size={18} />}>
              <form onSubmit={handleCreateHousehold} className="grid gap-4">
                <Field label="Household name">
                  <input
                    className={inputClass}
                    required
                    value={householdForm.name}
                    onChange={(event) => setHouseholdForm({ ...householdForm, name: event.target.value })}
                  />
                </Field>
                <button disabled={busy} className={primaryButton}>
                  Create workspace
                </button>
              </form>
            </Panel>

            <Panel title="Join With Invite Code" icon={<ShieldCheck size={18} />}>
              <form onSubmit={handleJoinHousehold} className="grid gap-4">
                <Field label="Invite code">
                  <input
                    className={`${inputClass} uppercase tracking-[0.2em]`}
                    required
                    value={householdForm.joinCode}
                    onChange={(event) => setHouseholdForm({ ...householdForm, joinCode: event.target.value })}
                  />
                </Field>
                <button disabled={busy} className={secondaryButton}>
                  Join household
                </button>
              </form>
            </Panel>

            <Panel title="Workspace Preview" icon={<MoonStar size={18} />}>
              <div className="space-y-4 text-sm text-slate-300">
                <p>New households start with a single demo pet profile so the workspace is immediately usable.</p>
                <p>Invite code sharing, assigned routines, and the care timeline become available as soon as you join.</p>
                <p>Medication stock and vet appointments sit alongside daily care instead of living in separate tools.</p>
              </div>
            </Panel>
          </section>
        ) : (
          <div className="grid gap-6">
            <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
              <Panel
                title={snapshot?.user.householdName ?? 'Household'}
                icon={<Users size={18} />}
                action={
                  <button onClick={handleLogout} className={ghostButton} disabled={busy}>
                    Log out
                  </button>
                }
              >
                <div className="grid gap-5 md:grid-cols-[1fr_0.95fr]">
                  <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Invite code</p>
                    <p className="mt-3 text-3xl font-semibold tracking-[0.28em] text-teal-200">
                      {snapshot?.user.joinCode}
                    </p>
                    <p className="mt-3 text-sm text-slate-300">
                      Share this code with anyone who helps cover feeding, walks, or meds.
                    </p>
                  </div>

                  <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Members</p>
                    <div className="mt-4 space-y-3">
                      {members.map((member) => (
                        <div key={member.id} className="flex items-center justify-between gap-4 rounded-2xl bg-white/5 px-4 py-3">
                          <div>
                            <p className="font-medium text-white">{member.name}</p>
                            <p className="text-xs text-slate-400">{member.email}</p>
                          </div>
                          <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">
                            Member
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Panel>

              <Panel title="Pet Profiles" icon={<PawPrint size={18} />}>
                <div className="grid gap-5 lg:grid-cols-[1fr_0.95fr]">
                  <div className="grid gap-4">
                    {pets.map((pet) => (
                      <PetCard
                        key={pet.id}
                        pet={pet}
                        routines={routinesByPet.get(pet.id) ?? []}
                        onEdit={() => startEditingPet(pet)}
                        onDelete={() =>
                          runAction(async () => {
                            await api.deletePet(pet.id);
                            setInfo(`${pet.name} removed.`);
                            resetPetForm();
                            await refreshApp();
                          })
                        }
                      />
                    ))}
                    {pets.length === 0 ? <EmptyState text="Add the first pet profile to unlock routines and planning." /> : null}
                  </div>

                  <form onSubmit={handlePetSubmit} className="grid gap-4 rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
                    <p className="text-sm font-medium text-white">{editingPetId ? 'Edit pet' : 'Add pet'}</p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Name">
                        <input
                          className={inputClass}
                          required
                          value={petDraft.name}
                          onChange={(event) => setPetDraft({ ...petDraft, name: event.target.value })}
                        />
                      </Field>
                      <Field label="Species">
                        <input
                          className={inputClass}
                          required
                          value={petDraft.species}
                          onChange={(event) => setPetDraft({ ...petDraft, species: event.target.value })}
                        />
                      </Field>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Breed">
                        <input
                          className={inputClass}
                          value={petDraft.breed}
                          onChange={(event) => setPetDraft({ ...petDraft, breed: event.target.value })}
                        />
                      </Field>
                      <Field label="Age summary">
                        <input
                          className={inputClass}
                          value={petDraft.ageSummary}
                          onChange={(event) => setPetDraft({ ...petDraft, ageSummary: event.target.value })}
                        />
                      </Field>
                    </div>

                    <Field label="Profile icon">
                      <div className="flex flex-wrap gap-2">
                        {avatars.map((avatar) => (
                          <button
                            key={avatar}
                            type="button"
                            onClick={() => setPetDraft({ ...petDraft, avatar })}
                            className={`rounded-2xl border px-4 py-2 text-2xl transition ${
                              petDraft.avatar === avatar ? 'border-teal-300 bg-teal-300/15' : 'border-white/10 bg-white/5'
                            }`}
                          >
                            {avatar}
                          </button>
                        ))}
                      </div>
                    </Field>

                    <Field label="Care notes">
                      <textarea
                        className={inputClass}
                        rows={4}
                        value={petDraft.notes}
                        onChange={(event) => setPetDraft({ ...petDraft, notes: event.target.value })}
                      />
                    </Field>

                    <div className="flex gap-3">
                      <button disabled={busy} className={primaryButton}>
                        {editingPetId ? 'Save pet' : 'Add pet'}
                      </button>
                      {editingPetId ? (
                        <button type="button" className={ghostButton} onClick={() => resetPetForm()}>
                          Cancel
                        </button>
                      ) : null}
                    </div>
                  </form>
                </div>
              </Panel>
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
              <Panel title="Care Routines" icon={<HeartPulse size={18} />}>
                <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
                  <div className="grid gap-4">
                    {(snapshot?.routines ?? []).map((routine) => (
                      <RoutineCard
                        key={routine.id}
                        routine={routine}
                        pet={pets.find((pet) => pet.id === routine.petId)}
                        evidence={evidenceDrafts[routine.id] ?? ''}
                        onEvidenceChange={(value) =>
                          setEvidenceDrafts((current) => ({
                            ...current,
                            [routine.id]: value,
                          }))
                        }
                        onEdit={() => startEditingRoutine(routine)}
                        onDelete={() =>
                          runAction(async () => {
                            await api.deleteRoutine(routine.id);
                            setInfo(`${routine.title} removed.`);
                            resetRoutineForm(routineDraft.petId || selectedPetId);
                            await refreshApp();
                          })
                        }
                        onComplete={() => handleCompleteRoutine(routine)}
                      />
                    ))}
                    {routineCount === 0 ? (
                      <EmptyState text="Add feeding, walk, or medication routines to create a shared care workflow." />
                    ) : null}
                  </div>

                  <form onSubmit={handleRoutineSubmit} className="grid gap-4 rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
                    <p className="text-sm font-medium text-white">{editingRoutineId ? 'Edit routine' : 'Add routine'}</p>
                    <Field label="Pet">
                      <select
                        className={inputClass}
                        required
                        value={routineDraft.petId}
                        onChange={(event) => setRoutineDraft({ ...routineDraft, petId: Number(event.target.value) })}
                      >
                        <option value={0}>Select pet</option>
                        {pets.map((pet) => (
                          <option key={pet.id} value={pet.id}>
                            {pet.name}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Routine">
                        <input
                          className={inputClass}
                          required
                          value={routineDraft.title}
                          onChange={(event) => setRoutineDraft({ ...routineDraft, title: event.target.value })}
                        />
                      </Field>
                      <Field label="Type">
                        <select
                          className={inputClass}
                          value={routineDraft.routineType}
                          onChange={(event) =>
                            setRoutineDraft({ ...routineDraft, routineType: event.target.value as RoutineType })
                          }
                        >
                          {routineOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Schedule">
                        <input
                          className={inputClass}
                          required
                          value={routineDraft.scheduleLabel}
                          onChange={(event) => setRoutineDraft({ ...routineDraft, scheduleLabel: event.target.value })}
                        />
                      </Field>
                      <Field label="Assignee">
                        <MemberSelect
                          members={members}
                          value={routineDraft.assigneeId}
                          onChange={(assigneeId) => setRoutineDraft({ ...routineDraft, assigneeId })}
                        />
                      </Field>
                    </div>

                    <Field label="Instructions">
                      <textarea
                        className={inputClass}
                        rows={4}
                        value={routineDraft.instructions}
                        onChange={(event) => setRoutineDraft({ ...routineDraft, instructions: event.target.value })}
                      />
                    </Field>

                    <div className="flex gap-3">
                      <button disabled={busy || !pets.length} className={primaryButton}>
                        {editingRoutineId ? 'Save routine' : 'Add routine'}
                      </button>
                      {editingRoutineId ? (
                        <button type="button" className={ghostButton} onClick={() => resetRoutineForm(selectedPetId)}>
                          Cancel
                        </button>
                      ) : null}
                    </div>
                  </form>
                </div>
              </Panel>

              <Panel title="Care Log Timeline" icon={<MessageSquare size={18} />}>
                <div className="grid gap-4">
                  {(snapshot?.careLogs ?? []).map((log) => (
                    <article key={log.id} className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-white">
                            {log.petName} · {labelForRoutineType(log.routineType)}
                          </p>
                          <p className="mt-1 text-lg font-semibold text-teal-200">{log.routineTitle}</p>
                          <p className="mt-2 text-sm text-slate-300">{log.evidenceText}</p>
                        </div>
                        <div className="text-right text-xs text-slate-400">
                          <p>{log.completedByName}</p>
                          <p>{formatDateTime(log.createdAt)}</p>
                        </div>
                      </div>

                      <div className="mt-4 space-y-3 rounded-[1.25rem] border border-white/10 bg-black/10 p-4">
                        {log.comments.length ? (
                          log.comments.map((comment) => (
                            <div key={comment.id} className="rounded-2xl bg-white/5 px-4 py-3">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-medium text-white">{comment.authorName}</p>
                                <p className="text-xs text-slate-400">{formatDistance(comment.createdAt)}</p>
                              </div>
                              <p className="mt-2 text-sm text-slate-300">{comment.body}</p>
                            </div>
                          ))
                        ) : (
                          <EmptyState text="No follow-up comments yet." compact />
                        )}

                        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                          <input
                            className={inputClass}
                            placeholder="Add context for the next caregiver"
                            value={commentDrafts[log.id] ?? ''}
                            onChange={(event) =>
                              setCommentDrafts((current) => ({ ...current, [log.id]: event.target.value }))
                            }
                          />
                          <button className={secondaryButton} onClick={() => handleAddComment(log)} disabled={busy}>
                            Comment
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                  {careLogCount === 0 ? <EmptyState text="Completed routines will appear here with evidence and comments." /> : null}
                </div>
              </Panel>
            </section>

            <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
              <Panel title="Medication Inventory" icon={<Pill size={18} />}>
                <div className="grid gap-5 lg:grid-cols-[1fr_0.95fr]">
                  <div className="grid gap-4">
                    {snapshot?.lowStockAlerts.length ? (
                      <div className="rounded-[1.5rem] border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">
                        <p className="font-medium">Low-stock alerts</p>
                        <div className="mt-3 space-y-2">
                          {snapshot.lowStockAlerts.map((item) => (
                            <p key={item.id}>
                              {item.petName}: {item.medicationName} is at {item.onHand} {item.unit}.
                            </p>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {(snapshot?.medicationInventory ?? []).map((item) => (
                      <InventoryCard
                        key={item.id}
                        item={item}
                        onEdit={() => startEditingMedication(item)}
                        onDelete={() =>
                          runAction(async () => {
                            await api.deleteMedication(item.id);
                            setInfo(`${item.medicationName} removed.`);
                            resetMedicationForm(selectedPetId);
                            await refreshApp();
                          })
                        }
                      />
                    ))}
                    {snapshot?.medicationInventory.length === 0 ? (
                      <EmptyState text="Track medication levels and threshold alerts here." />
                    ) : null}
                  </div>

                  <form onSubmit={handleMedicationSubmit} className="grid gap-4 rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
                    <p className="text-sm font-medium text-white">{editingMedicationId ? 'Edit medication' : 'Add medication'}</p>
                    <Field label="Pet">
                      <select
                        className={inputClass}
                        required
                        value={medicationDraft.petId}
                        onChange={(event) => setMedicationDraft({ ...medicationDraft, petId: Number(event.target.value) })}
                      >
                        <option value={0}>Select pet</option>
                        {pets.map((pet) => (
                          <option key={pet.id} value={pet.id}>
                            {pet.name}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Medication">
                      <input
                        className={inputClass}
                        required
                        value={medicationDraft.medicationName}
                        onChange={(event) => setMedicationDraft({ ...medicationDraft, medicationName: event.target.value })}
                      />
                    </Field>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="On hand">
                        <input
                          className={inputClass}
                          required
                          type="number"
                          min={0}
                          step="0.5"
                          value={String(medicationDraft.onHand)}
                          onChange={(event) =>
                            setMedicationDraft({ ...medicationDraft, onHand: Number(event.target.value) })
                          }
                        />
                      </Field>
                      <Field label="Unit">
                        <input
                          className={inputClass}
                          required
                          value={medicationDraft.unit}
                          onChange={(event) => setMedicationDraft({ ...medicationDraft, unit: event.target.value })}
                        />
                      </Field>
                    </div>

                    <Field label="Low-stock threshold">
                      <input
                        className={inputClass}
                        required
                        type="number"
                        min={0}
                        step="0.5"
                        value={String(medicationDraft.lowStockThreshold)}
                        onChange={(event) =>
                          setMedicationDraft({ ...medicationDraft, lowStockThreshold: Number(event.target.value) })
                        }
                      />
                    </Field>

                    <Field label="Dosage notes">
                      <textarea
                        className={inputClass}
                        rows={4}
                        value={medicationDraft.dosageNotes}
                        onChange={(event) => setMedicationDraft({ ...medicationDraft, dosageNotes: event.target.value })}
                      />
                    </Field>

                    <div className="flex gap-3">
                      <button disabled={busy || !pets.length} className={primaryButton}>
                        {editingMedicationId ? 'Save medication' : 'Add medication'}
                      </button>
                      {editingMedicationId ? (
                        <button type="button" className={ghostButton} onClick={() => resetMedicationForm(selectedPetId)}>
                          Cancel
                        </button>
                      ) : null}
                    </div>
                  </form>
                </div>
              </Panel>

              <Panel title="Vet Appointment Planner" icon={<CalendarDays size={18} />}>
                <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
                  <form onSubmit={handleAppointmentSubmit} className="grid gap-4 rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
                    <p className="text-sm font-medium text-white">
                      {editingAppointmentId ? 'Edit appointment' : 'Plan appointment'}
                    </p>

                    <Field label="Pet">
                      <select
                        className={inputClass}
                        required
                        value={appointmentDraft.petId}
                        onChange={(event) => setAppointmentDraft({ ...appointmentDraft, petId: Number(event.target.value) })}
                      >
                        <option value={0}>Select pet</option>
                        {pets.map((pet) => (
                          <option key={pet.id} value={pet.id}>
                            {pet.name}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Visit title">
                        <input
                          className={inputClass}
                          required
                          value={appointmentDraft.title}
                          onChange={(event) => setAppointmentDraft({ ...appointmentDraft, title: event.target.value })}
                        />
                      </Field>
                      <Field label="Date + time">
                        <input
                          className={inputClass}
                          required
                          type="datetime-local"
                          value={appointmentDraft.appointmentAt}
                          onChange={(event) => setAppointmentDraft({ ...appointmentDraft, appointmentAt: event.target.value })}
                        />
                      </Field>
                    </div>

                    <Field label="Find a clinic">
                      <div className="grid gap-3">
                        <input
                          className={inputClass}
                          placeholder="Search with Nominatim"
                          value={appointmentDraft.placeQuery}
                          onChange={(event) =>
                            setAppointmentDraft({ ...appointmentDraft, placeQuery: event.target.value, placeName: event.target.value })
                          }
                        />
                        {placeSuggestions.length ? (
                          <div className="rounded-[1.25rem] border border-white/10 bg-black/20 p-2">
                            {placeSuggestions.map((suggestion) => (
                              <button
                                key={`${suggestion.latitude}-${suggestion.longitude}`}
                                type="button"
                                onClick={() => {
                                  setAppointmentDraft({
                                    ...appointmentDraft,
                                    placeQuery: suggestion.name,
                                    placeName: suggestion.name,
                                    address: suggestion.address,
                                  });
                                  setPlaceSuggestions([]);
                                }}
                                className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-white/5"
                              >
                                <MapPinned size={16} className="mt-0.5 shrink-0 text-teal-200" />
                                <span className="text-sm text-slate-300">{suggestion.label}</span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </Field>

                    <Field label="Clinic name">
                      <input
                        className={inputClass}
                        required
                        value={appointmentDraft.placeName}
                        onChange={(event) => setAppointmentDraft({ ...appointmentDraft, placeName: event.target.value })}
                      />
                    </Field>

                    <Field label="Address">
                      <textarea
                        className={inputClass}
                        rows={3}
                        value={appointmentDraft.address}
                        onChange={(event) => setAppointmentDraft({ ...appointmentDraft, address: event.target.value })}
                      />
                    </Field>

                    <Field label="Prep notes">
                      <textarea
                        className={inputClass}
                        rows={3}
                        value={appointmentDraft.notes}
                        onChange={(event) => setAppointmentDraft({ ...appointmentDraft, notes: event.target.value })}
                      />
                    </Field>

                    <div className="flex gap-3">
                      <button disabled={busy || !pets.length} className={primaryButton}>
                        {editingAppointmentId ? 'Save appointment' : 'Add appointment'}
                      </button>
                      {editingAppointmentId ? (
                        <button type="button" className={ghostButton} onClick={() => resetAppointmentForm(selectedPetId)}>
                          Cancel
                        </button>
                      ) : null}
                    </div>
                  </form>

                  <div className="grid gap-4">
                    {(snapshot?.vetAppointments ?? []).map((appointment) => (
                      <AppointmentCard
                        key={appointment.id}
                        appointment={appointment}
                        onEdit={() => startEditingAppointment(appointment)}
                        onDelete={() =>
                          runAction(async () => {
                            await api.deleteAppointment(appointment.id);
                            setInfo(`${appointment.title} removed.`);
                            resetAppointmentForm(selectedPetId);
                            await refreshApp();
                          })
                        }
                      />
                    ))}
                    {snapshot?.vetAppointments.length === 0 ? (
                      <EmptyState text="Plan the next vet visit with clinic lookup and prep notes." />
                    ) : null}
                  </div>
                </div>
              </Panel>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function formatDateTime(value: string) {
  return format(new Date(value), 'MMM d, yyyy · h:mm a');
}

function formatDistance(value: string) {
  return formatDistanceToNow(new Date(value), { addSuffix: true });
}

function labelForRoutineType(type: RoutineType) {
  return routineOptions.find((option) => option.value === type)?.label ?? type;
}

function Badge({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200">
      {icon}
      {label}
    </span>
  );
}

function StatPill({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-slate-400">
        {icon}
        {label}
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-white">{value}</p>
    </div>
  );
}

function Panel({
  title,
  icon,
  children,
  action,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-panel/80 p-5 shadow-panel backdrop-blur-xl sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="rounded-2xl border border-white/10 bg-white/5 p-2 text-teal-200">{icon}</span>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function FeatureCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
      <div className="inline-flex rounded-2xl border border-white/10 bg-white/5 p-2 text-teal-200">{icon}</div>
      <h3 className="mt-4 text-lg font-medium text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-300">{text}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="text-xs uppercase tracking-[0.24em] text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function EmptyState({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <div className={`rounded-[1.5rem] border border-dashed border-white/10 bg-white/5 text-slate-400 ${compact ? 'p-4 text-sm' : 'p-6 text-sm'}`}>
      {text}
    </div>
  );
}

function MemberSelect({
  members,
  value,
  onChange,
}: {
  members: HouseholdMember[];
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <select
      className={inputClass}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
    >
      <option value="">Unassigned</option>
      {members.map((member) => (
        <option key={member.id} value={member.id}>
          {member.name}
        </option>
      ))}
    </select>
  );
}

function PetCard({
  pet,
  routines,
  onEdit,
  onDelete,
}: {
  pet: PetProfile;
  routines: CareRoutine[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-[1.5rem] bg-white/10 text-3xl">{pet.avatar}</div>
          <div>
            <p className="text-xl font-semibold text-white">{pet.name}</p>
            <p className="text-sm text-slate-300">
              {pet.species}
              {pet.breed ? ` · ${pet.breed}` : ''}
              {pet.ageSummary ? ` · ${pet.ageSummary}` : ''}
            </p>
            {pet.notes ? <p className="mt-2 max-w-xl text-sm text-slate-400">{pet.notes}</p> : null}
          </div>
        </div>
        <div className="flex gap-2">
          <button className={ghostButton} onClick={onEdit}>
            Edit
          </button>
          <button className={dangerButton} onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {routines.map((routine) => (
          <span key={routine.id} className="rounded-full border border-white/10 bg-black/10 px-3 py-1 text-xs text-slate-300">
            {labelForRoutineType(routine.routineType)} · {routine.scheduleLabel}
          </span>
        ))}
        {!routines.length ? (
          <span className="rounded-full border border-dashed border-white/10 px-3 py-1 text-xs text-slate-500">No routines yet</span>
        ) : null}
      </div>
    </article>
  );
}

function RoutineCard({
  routine,
  pet,
  evidence,
  onEvidenceChange,
  onEdit,
  onDelete,
  onComplete,
}: {
  routine: CareRoutine;
  pet: PetProfile | undefined;
  evidence: string;
  onEvidenceChange: (value: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  onComplete: () => void;
}) {
  return (
    <article className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-teal-300/20 bg-teal-300/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-teal-100">
              {labelForRoutineType(routine.routineType)}
            </span>
            <span className="text-sm text-slate-400">{pet?.name}</span>
          </div>
          <p className="mt-3 text-xl font-semibold text-white">{routine.title}</p>
          <p className="mt-2 text-sm text-slate-300">{routine.scheduleLabel}</p>
          {routine.instructions ? <p className="mt-2 text-sm text-slate-400">{routine.instructions}</p> : null}
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
            <span>Assignee: {routine.assigneeName ?? 'Unassigned'}</span>
            <span>Last completed: {routine.lastCompletedAt ? formatDistance(routine.lastCompletedAt) : 'Not yet logged'}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button className={ghostButton} onClick={onEdit}>
            Edit
          </button>
          <button className={dangerButton} onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
        <input
          className={inputClass}
          placeholder="Completion evidence, observations, or medication note"
          value={evidence}
          onChange={(event) => onEvidenceChange(event.target.value)}
        />
        <button className={primaryButton} onClick={onComplete}>
          Log completion
        </button>
      </div>
    </article>
  );
}

function InventoryCard({
  item,
  onEdit,
  onDelete,
}: {
  item: MedicationInventoryItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const low = item.onHand <= item.lowStockThreshold;
  return (
    <article className={`rounded-[1.5rem] border p-5 ${low ? 'border-rose-400/30 bg-rose-500/10' : 'border-white/10 bg-white/5'}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-lg font-semibold text-white">{item.medicationName}</p>
          <p className="mt-1 text-sm text-slate-300">
            {item.petName} · {item.onHand} {item.unit} on hand
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Threshold {item.lowStockThreshold} {item.unit} · Updated by {item.updatedByName} {formatDistance(item.updatedAt)}
          </p>
          {item.dosageNotes ? <p className="mt-3 text-sm text-slate-300">{item.dosageNotes}</p> : null}
        </div>
        <div className="flex gap-2">
          <button className={ghostButton} onClick={onEdit}>
            Edit
          </button>
          <button className={dangerButton} onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}

function AppointmentCard({
  appointment,
  onEdit,
  onDelete,
}: {
  appointment: VetAppointment;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-lg font-semibold text-white">{appointment.title}</p>
          <p className="mt-1 text-sm text-slate-300">{appointment.petName}</p>
          <p className="mt-2 text-sm text-teal-200">{formatDateTime(appointment.appointmentAt)}</p>
          <p className="mt-2 text-sm text-slate-300">{appointment.placeName}</p>
          {appointment.address ? <p className="mt-1 text-sm text-slate-400">{appointment.address}</p> : null}
          {appointment.notes ? <p className="mt-3 text-sm text-slate-300">{appointment.notes}</p> : null}
        </div>
        <div className="flex gap-2">
          <button className={ghostButton} onClick={onEdit}>
            Edit
          </button>
          <button className={dangerButton} onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}

function Banner({ tone, message }: { tone: 'error' | 'info'; message: string }) {
  return (
    <div
      className={`mb-4 rounded-[1.35rem] border px-4 py-3 text-sm ${
        tone === 'error'
          ? 'border-rose-400/30 bg-rose-500/10 text-rose-100'
          : 'border-teal-300/30 bg-teal-400/10 text-teal-100'
      }`}
    >
      {message}
    </div>
  );
}

const inputClass =
  'w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-teal-300/50 focus:bg-black/30';

const primaryButton =
  'rounded-2xl bg-teal-300 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-teal-200 disabled:cursor-not-allowed disabled:opacity-60';

const secondaryButton =
  'rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60';

const ghostButton =
  'rounded-2xl border border-white/10 bg-transparent px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60';

const dangerButton =
  'rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-2 text-sm text-rose-100 transition hover:bg-rose-500/20';

function tabClass(active: boolean) {
  return `flex-1 rounded-full px-4 py-2 text-sm transition ${active ? 'bg-teal-300 text-slate-950' : 'text-slate-300 hover:bg-white/5'}`;
}
