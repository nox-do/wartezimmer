import {
  fetchAuthStatus,
  loginAuthSession,
  type AuthLoginRequest,
  type AuthSessionUser,
  type StaffAuthRole,
} from './session-client';
import {
  applyStaffAuthAnonymous,
  markStaffAuthUnauthorized,
  staffAuthSlot,
  staffAuthSlots,
} from './staff-auth-slot-state.svelte';

export type { StaffAuthRole } from './session-client';
export type { AuthSessionState } from './staff-auth-slot-state.svelte';
export { staffAuthSlots };

const inflightLoads: Partial<Record<StaffAuthRole, Promise<void>>> = {};

function userFromSession(session: { sessionId: string; role: StaffAuthRole }): AuthSessionUser {
  return {
    id: session.sessionId,
    role: session.role,
  };
}

export function markAuthUnauthorized(role: StaffAuthRole, message: string | null = null) {
  markStaffAuthUnauthorized(role, message);
}

export function shouldLoadAuthSession(role: StaffAuthRole): boolean {
  const slot = staffAuthSlot(role);
  if (slot.status === 'loading') {
    return false;
  }
  if (slot.status === 'idle') {
    return true;
  }
  return false;
}

export async function loadAuthSession(role: StaffAuthRole): Promise<void> {
  const inflight = inflightLoads[role];
  if (inflight) {
    await inflight;
    return;
  }

  if (!shouldLoadAuthSession(role)) {
    return;
  }

  const loadPromise = loadAuthSessionInternal(role);
  inflightLoads[role] = loadPromise;
  try {
    await loadPromise;
  } finally {
    delete inflightLoads[role];
  }
}

async function loadAuthSessionInternal(role: StaffAuthRole): Promise<void> {
  const slot = staffAuthSlot(role);
  slot.status = 'loading';
  slot.errorMessage = null;

  const result = await fetchAuthStatus(role);
  if (!result.ok) {
    if (result.error.status === 401 || result.error.code === 'AUTH_UNAUTHORIZED') {
      applyStaffAuthAnonymous(role);
      return;
    }

    slot.status = 'error';
    slot.user = null;
    slot.errorMessage = result.error.message;
    return;
  }

  slot.status = 'authenticated';
  slot.user = userFromSession(result.data);
  slot.errorMessage = null;
}

export async function submitAuthLogin(payload: AuthLoginRequest): Promise<boolean> {
  const role = payload.role;
  const slot = staffAuthSlot(role);
  slot.status = 'loading';
  slot.errorMessage = null;

  const result = await loginAuthSession(payload);
  if (!result.ok) {
    applyStaffAuthAnonymous(role, result.error.message);
    return false;
  }

  slot.status = 'authenticated';
  slot.user = userFromSession(result.data);
  slot.errorMessage = null;
  return true;
}
