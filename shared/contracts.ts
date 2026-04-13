export type RoutineType = 'feeding' | 'walk' | 'medication';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  householdId: number | null;
  householdName: string | null;
  joinCode: string | null;
}

export interface HouseholdMember {
  id: number;
  name: string;
  email: string;
}

export interface PetProfile {
  id: number;
  name: string;
  species: string;
  breed: string | null;
  ageSummary: string | null;
  notes: string | null;
  avatar: string;
  createdAt: string;
}

export interface CareRoutine {
  id: number;
  petId: number;
  title: string;
  routineType: RoutineType;
  scheduleLabel: string;
  instructions: string | null;
  assigneeId: number | null;
  assigneeName: string | null;
  lastCompletedAt: string | null;
}

export interface CareLogComment {
  id: number;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface CareLogEntry {
  id: number;
  petId: number;
  petName: string;
  routineId: number | null;
  routineTitle: string;
  routineType: RoutineType;
  completedByName: string;
  evidenceText: string;
  createdAt: string;
  comments: CareLogComment[];
}

export interface MedicationInventoryItem {
  id: number;
  petId: number;
  petName: string;
  medicationName: string;
  onHand: number;
  unit: string;
  lowStockThreshold: number;
  dosageNotes: string | null;
  updatedAt: string;
  updatedByName: string;
}

export interface VetAppointment {
  id: number;
  petId: number;
  petName: string;
  title: string;
  appointmentAt: string;
  placeName: string;
  address: string | null;
  notes: string | null;
  createdByName: string;
}

export interface ActivityEvent {
  id: number;
  actorName: string;
  action: string;
  entityType: string;
  entityLabel: string;
  details: string | null;
  createdAt: string;
}

export interface PlaceSuggestion {
  label: string;
  name: string;
  address: string;
  latitude: string;
  longitude: string;
}

export interface AppSnapshot {
  user: AuthUser;
  members: HouseholdMember[];
  pets: PetProfile[];
  routines: CareRoutine[];
  careLogs: CareLogEntry[];
  medicationInventory: MedicationInventoryItem[];
  lowStockAlerts: MedicationInventoryItem[];
  vetAppointments: VetAppointment[];
  activity: ActivityEvent[];
}
