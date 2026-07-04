import { getClientConfig } from '$lib/auth/app-config';

/** Resolve an API path against `VITE_API_BASE` (relative path when unset — Vite proxy in dev). */
export function buildApiUrl(path: string, baseUrl = getClientConfig().baseUrl): string {
  return baseUrl ? `${baseUrl}${path}` : path;
}

export function buildApiStreamUrl(path: string): string {
  return buildApiUrl(path);
}
