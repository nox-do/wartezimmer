import { cookieAuthFetch, mfaAuthFetch, opsAuthFetch } from '$lib/api/cookie-auth-fetch';
import type { Result } from '$lib/types/result';
import type {
  AuthPinTarget,
  ChangePinResponse,
  StaffLoginRequest,
  StaffSessionResponse,
} from './openapi-types';

export type AuthUserRole = 'mfa' | 'ops' | 'terminal' | 'tv';

export type AuthSessionUser = {
  id: string;
  displayName?: string;
  roles: AuthUserRole[];
};

export type AuthSessionStatus = StaffSessionResponse;
export type AuthLoginRequest = StaffLoginRequest;
export type ChangeAuthPinResponse = ChangePinResponse;

export type { AuthPinTarget };

export async function fetchAuthStatus(
  role: Extract<AuthUserRole, 'mfa' | 'ops'>,
): Promise<Result<AuthSessionStatus>> {
  const fetch = role === 'ops' ? opsAuthFetch : mfaAuthFetch;
  return fetch<AuthSessionStatus>('/api/v1/auth/me');
}

export async function loginAuthSession(
  payload: AuthLoginRequest,
): Promise<Result<AuthSessionStatus>> {
  return cookieAuthFetch<AuthSessionStatus>(
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
}

export async function changeAuthPin(payload: {
  currentPin: string;
  newPin: string;
  target: AuthPinTarget;
  role: Extract<AuthUserRole, 'mfa' | 'ops'>;
}): Promise<Result<ChangeAuthPinResponse>> {
  const fetch = payload.role === 'ops' ? opsAuthFetch : mfaAuthFetch;
  return fetch<ChangePinResponse>(
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
}
