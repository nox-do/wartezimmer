import { httpFetch, type HttpFetchOptions } from './http-fetch';

export type CookieAuthFetchOptions = Omit<HttpFetchOptions, 'authToken' | 'credentials'>;

type CookieClientRole = 'mfa' | 'ops' | 'terminal' | 'room-panel';

export function withCookieClientRole(init: RequestInit, role: CookieClientRole): RequestInit {
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
    onUnauthorized: options.onUnauthorized,
  });
}

export async function terminalAuthFetch<T>(
  path: string,
  init: RequestInit = {},
  options: CookieAuthFetchOptions = {},
) {
  return cookieAuthFetch<T>(path, withCookieClientRole(init, 'terminal'), options);
}

export async function roomPanelAuthFetch<T>(
  path: string,
  init: RequestInit = {},
  options: CookieAuthFetchOptions = {},
) {
  return cookieAuthFetch<T>(path, withCookieClientRole(init, 'room-panel'), options);
}
