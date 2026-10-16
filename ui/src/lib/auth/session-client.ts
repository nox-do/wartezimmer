import { cookieAuthFetch, withCookieClientRole } from '$lib/api/cookie-auth-fetch';
import { mfaAuthFetch, opsAuthFetch } from '$lib/api/staff-auth-fetch';
import type { Result } from '$lib/types/result';
import { notifyStaffSessionChanged } from './staff-session-sync';
import type {
  AuthPinTarget,
  ChangePinResponse,
  StaffLoginRequest,
  StaffSessionResponse,
} from './openapi-types';

export type StaffAuthRole = 'mfa' | 'ops';

export type AuthSessionUser = {
  id: string;
  displayName?: string;
  role: StaffAuthRole;
  pinChangeRequired: boolean;
};

export type AuthSessionStatus = StaffSessionResponse;
export type AuthLoginRequest = StaffLoginRequest;
export type ChangeAuthPinResponse = ChangePinResponse;

export type { AuthPinTarget };

export async function fetchAuthStatus(role: StaffAuthRole): Promise<Result<AuthSessionStatus>> {
  // The state loader applies 401 only if this response still belongs to its current request.
  return cookieAuthFetch<AuthSessionStatus>('/api/v1/auth/me', withCookieClientRole({}, role));
}

export async function loginAuthSession(
  payload: AuthLoginRequest,
): Promise<Result<AuthSessionStatus>> {
  const result = await cookieAuthFetch<AuthSessionStatus>(
    '/api/v1/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({
        pin: payload.pin,
        role: payload.role,
      }),
    },
    { includeClientOriginHeader: true },
  );
  if (result.ok) notifyStaffSessionChanged(payload.role);
  return result;
}

export async function logoutAuthSession(role: StaffAuthRole): Promise<Result<{ ok: true }>> {
  const fetch = role === 'ops' ? opsAuthFetch : mfaAuthFetch;
  const result = await fetch<{ ok: true }>('/api/v1/auth/logout', { method: 'POST' });
  if (result.ok) notifyStaffSessionChanged(role);
  return result;
}

export async function changeAuthPin(payload: {
  currentPin: string;
  newPin: string;
  target: AuthPinTarget;
  role: StaffAuthRole;
}): Promise<Result<ChangeAuthPinResponse>> {
  const fetch = payload.role === 'ops' ? opsAuthFetch : mfaAuthFetch;
  const result = await fetch<ChangePinResponse>(
    '/api/v1/auth/pin/change',
    {
      method: 'POST',
      body: JSON.stringify({
        currentPin: payload.currentPin,
        newPin: payload.newPin,
        target: payload.target,
      }),
    },
    { includeClientOriginHeader: true },
  );
  if (result.ok && payload.target !== 'room-panel') notifyStaffSessionChanged(payload.target);
  return result;
}
