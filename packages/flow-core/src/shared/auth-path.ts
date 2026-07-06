import type { AuthPath } from './types.js';

/** Terminal-Identifikation — unabhaengig von checkInPath (Routing-Kontext). */
export const AUTH_PATHS = new Set<AuthPath>(['phone_dob', 'name_dob', 'egk', 'none']);

export function isAuthPath(value: string): value is AuthPath {
  return AUTH_PATHS.has(value as AuthPath);
}
