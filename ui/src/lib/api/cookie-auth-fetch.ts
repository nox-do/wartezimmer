import { markAuthUnauthorized } from '$lib/auth/session-state.svelte';
import { httpFetch, type HttpFetchOptions } from './http-fetch';

type CookieAuthFetchOptions = Omit<
  HttpFetchOptions,
  'authToken' | 'credentials' | 'onUnauthorized'
>;

export type StaffClientRole = 'mfa' | 'ops';

function withClientRole(init: RequestInit, role: StaffClientRole): RequestInit {
  const headers = new Headers(init.headers);
  headers.set('X-Client-Role', role);
  return { ...init, headers };
}

export async function cookieAuthFetch<T>(
  path: string,
  init: RequestInit = {},
  options: CookieAuthFetchOptions = {},
) {
  return httpFetch<T>(path, init, {
    ...options,
    credentials: init.credentials ?? 'include',
    includeClientOriginHeader: options.includeClientOriginHeader ?? true,
    onUnauthorized: () => markAuthUnauthorized(),
  });
}

export async function mfaAuthFetch<T>(
  path: string,
  init: RequestInit = {},
  options: CookieAuthFetchOptions = {},
) {
  return cookieAuthFetch<T>(path, withClientRole(init, 'mfa'), options);
}

export async function opsAuthFetch<T>(
  path: string,
  init: RequestInit = {},
  options: CookieAuthFetchOptions = {},
) {
  return cookieAuthFetch<T>(path, withClientRole(init, 'ops'), options);
}
