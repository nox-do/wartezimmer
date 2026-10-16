import type { StaffAuthRole } from '$lib/auth/session-client';
import { markStaffAuthUnauthorized, staffAuthSlot } from '$lib/auth/staff-auth-slot-state.svelte';
import {
  cookieAuthFetch,
  withCookieClientRole,
  type CookieAuthFetchOptions,
} from './cookie-auth-fetch';

type StaffAuthFetchOptions = Omit<CookieAuthFetchOptions, 'onUnauthorized'>;

function staffAuthFetch<T>(
  role: StaffAuthRole,
  path: string,
  init: RequestInit = {},
  options: StaffAuthFetchOptions = {},
) {
  const slot = staffAuthSlot(role);
  const sessionId = slot.user?.id;
  return cookieAuthFetch<T>(path, withCookieClientRole(init, role), {
    ...options,
    onUnauthorized: () => {
      if (slot.user?.id === sessionId) markStaffAuthUnauthorized(role);
    },
  });
}

export async function mfaAuthFetch<T>(
  path: string,
  init: RequestInit = {},
  options: StaffAuthFetchOptions = {},
) {
  return staffAuthFetch<T>('mfa', path, init, options);
}

export async function opsAuthFetch<T>(
  path: string,
  init: RequestInit = {},
  options: StaffAuthFetchOptions = {},
) {
  return staffAuthFetch<T>('ops', path, init, options);
}
