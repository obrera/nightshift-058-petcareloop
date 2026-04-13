import type { AppSnapshot, AuthUser, PlaceSuggestion } from '@shared/contracts';

type ApiError = { error: string };

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({ error: 'Request failed.' }))) as ApiError;
    throw new Error(error.error || 'Request failed.');
  }

  return (await response.json()) as T;
}

export const api = {
  register(payload: { name: string; email: string; password: string }) {
    return request<{ user: AuthUser | null }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  login(payload: { email: string; password: string }) {
    return request<{ user: AuthUser | null }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  logout() {
    return request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
  },
  me() {
    return request<{ user: AuthUser | null }>('/api/auth/me');
  },
  app() {
    return request<AppSnapshot>('/api/app');
  },
  createHousehold(payload: { name: string }) {
    return request<{ householdId: number; joinCode: string; user: AuthUser | null }>('/api/household/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  joinHousehold(payload: { joinCode: string }) {
    return request<{ user: AuthUser | null }>('/api/household/join', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  createPet(payload: unknown) {
    return request<{ id: number }>('/api/pets', { method: 'POST', body: JSON.stringify(payload) });
  },
  updatePet(id: number, payload: unknown) {
    return request<{ ok: boolean }>(`/api/pets/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  },
  deletePet(id: number) {
    return request<{ ok: boolean }>(`/api/pets/${id}`, { method: 'DELETE' });
  },
  createRoutine(payload: unknown) {
    return request<{ id: number }>('/api/routines', { method: 'POST', body: JSON.stringify(payload) });
  },
  updateRoutine(id: number, payload: unknown) {
    return request<{ ok: boolean }>(`/api/routines/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  },
  deleteRoutine(id: number) {
    return request<{ ok: boolean }>(`/api/routines/${id}`, { method: 'DELETE' });
  },
  completeRoutine(id: number, payload: { evidenceText: string }) {
    return request<{ id: number }>(`/api/routines/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  addCareLogComment(id: number, payload: { body: string }) {
    return request<{ id: number }>(`/api/care-logs/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  createMedication(payload: unknown) {
    return request<{ id: number }>('/api/medications', { method: 'POST', body: JSON.stringify(payload) });
  },
  updateMedication(id: number, payload: unknown) {
    return request<{ ok: boolean }>(`/api/medications/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  },
  deleteMedication(id: number) {
    return request<{ ok: boolean }>(`/api/medications/${id}`, { method: 'DELETE' });
  },
  createAppointment(payload: unknown) {
    return request<{ id: number }>('/api/appointments', { method: 'POST', body: JSON.stringify(payload) });
  },
  updateAppointment(id: number, payload: unknown) {
    return request<{ ok: boolean }>(`/api/appointments/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  },
  deleteAppointment(id: number) {
    return request<{ ok: boolean }>(`/api/appointments/${id}`, { method: 'DELETE' });
  },
  searchPlaces(query: string) {
    return request<{ results: PlaceSuggestion[] }>(`/api/places/search?q=${encodeURIComponent(query)}`);
  },
};
