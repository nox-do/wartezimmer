import type { AuthSessionUser, StaffAuthRole } from './session-client';

export type AuthSessionState = {
  status: 'idle' | 'loading' | 'authenticated' | 'anonymous' | 'error';
  user: AuthSessionUser | null;
  errorMessage: string | null;
};

function createIdleState(): AuthSessionState {
  return { status: 'idle', user: null, errorMessage: null };
}

export const staffAuthSlots = $state<Record<StaffAuthRole, AuthSessionState>>({
  mfa: createIdleState(),
  ops: createIdleState(),
});

export function staffAuthSlot(role: StaffAuthRole): AuthSessionState {
  return staffAuthSlots[role];
}

export function applyStaffAuthAnonymous(role: StaffAuthRole, message: string | null = null): void {
  const slot = staffAuthSlot(role);
  slot.status = 'anonymous';
  slot.user = null;
  slot.errorMessage = message;
}

export function markStaffAuthUnauthorized(
  role: StaffAuthRole,
  message: string | null = null,
): void {
  const slot = staffAuthSlot(role);
  if (slot.status !== 'authenticated' || slot.user?.role !== role) {
    return;
  }
  applyStaffAuthAnonymous(role, message);
}
