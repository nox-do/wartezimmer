import {
  changeAuthPin,
  fetchAuthStatus,
  loginAuthSession,
  logoutAuthSession,
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
const loginVersions: Partial<Record<StaffAuthRole, number>> = {};

export async function submitAuthPinSetup(payload: {
  role: StaffAuthRole;
  currentPin: string;
  newPin: string;
}) {
  const { role } = payload;
  const slot = staffAuthSlot(role);
  const sessionId = slot.user?.id;
  const result = await changeAuthPin({ ...payload, target: role });
  // A response belongs to the submitted role and session, even after navigation.
  if (result.ok && slot.status === 'authenticated' && slot.user?.id === sessionId) {
    if (role === 'ops') applyStaffAuthAnonymous(role);
    else if (slot.user) slot.user = { ...slot.user, pinChangeRequired: false };
  }
  return result;
}

export async function submitAuthLogout(role: StaffAuthRole) {
  const slot = staffAuthSlot(role);
  const sessionId = slot.user?.id;
  const result = await logoutAuthSession(role);
  if (result.ok && slot.status === 'authenticated' && slot.user?.id === sessionId) {
    applyStaffAuthAnonymous(role);
  }
  return result;
}

function userFromSession(session: {
  sessionId: string;
  role: StaffAuthRole;
  pinChangeRequired: boolean;
}): AuthSessionUser {
  return {
    id: session.sessionId,
    role: session.role,
    pinChangeRequired: session.pinChangeRequired,
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

export async function refreshAuthSession(role: StaffAuthRole): Promise<void> {
  // Do not probe roles which this tab has never opened.
  if (staffAuthSlot(role).status === 'idle') return;
  // A change in another tab may have happened after an already running request started.
  await inflightLoads[role];
  await loadAuthSession(role, true);
}

export async function loadAuthSession(role: StaffAuthRole, refresh = false): Promise<void> {
  const inflight = inflightLoads[role];
  if (inflight) {
    await inflight;
    return;
  }

  if (!refresh && !shouldLoadAuthSession(role)) {
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
  const background = slot.status === 'authenticated';
  if (!background) {
    slot.status = 'loading';
    slot.errorMessage = null;
  }
  const requestUser = slot.user;
  const requestStatus = slot.status;
  const loginVersion = loginVersions[role];

  const result = await fetchAuthStatus(role);
  // Login, logout or a local PIN change wins over an older status response.
  if (
    loginVersions[role] !== loginVersion ||
    slot.user !== requestUser ||
    slot.status !== requestStatus
  )
    return;
  if (!result.ok) {
    if (result.error.status === 401 || result.error.code === 'AUTH_UNAUTHORIZED') {
      applyStaffAuthAnonymous(role);
      return;
    }

    if (background) return;
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
  const loginVersion = (loginVersions[role] ?? 0) + 1;
  loginVersions[role] = loginVersion;
  const slot = staffAuthSlot(role);
  slot.status = 'loading';
  slot.errorMessage = null;

  const result = await loginAuthSession(payload);
  if (loginVersions[role] !== loginVersion) return false;
  if (!result.ok) {
    applyStaffAuthAnonymous(role, result.error.message);
    return false;
  }

  slot.status = 'authenticated';
  slot.user = userFromSession(result.data);
  slot.errorMessage = null;
  return true;
}
