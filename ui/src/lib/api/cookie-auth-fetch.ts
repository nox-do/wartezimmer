import { markAuthUnauthorized } from '$lib/auth/session-state.svelte';
import { httpFetch, type HttpFetchOptions } from './http-fetch';

type CookieAuthFetchOptions = Omit<
  HttpFetchOptions,
  'authToken' | 'credentials' | 'onUnauthorized'
>;

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
