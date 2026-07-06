import type { OpsSettings } from '../db/db-types.js';
import { domainError } from '../errors/domain-error.js';

const GUARDED_TERMINAL_AUTH_PATHS = ['phone_dob', 'name_dob', 'egk'] as const;
export const CHECKIN_AUTH_PATHS = [...GUARDED_TERMINAL_AUTH_PATHS, 'none'] as const;

export type GuardedTerminalAuthPath = (typeof GUARDED_TERMINAL_AUTH_PATHS)[number];
export type CheckinAuthPath = (typeof CHECKIN_AUTH_PATHS)[number];

export function isKnownCheckinAuthPath(authPath: string): authPath is CheckinAuthPath {
  return (CHECKIN_AUTH_PATHS as readonly string[]).includes(authPath);
}

export function assertKnownCheckinAuthPath(authPath: string): void {
  if (!isKnownCheckinAuthPath(authPath)) {
    throw domainError('INVALID_ARGUMENT');
  }
}

export function isGuardedTerminalAuthPath(authPath: string): authPath is GuardedTerminalAuthPath {
  return (GUARDED_TERMINAL_AUTH_PATHS as readonly string[]).includes(authPath);
}

export function isTerminalAuthPathEnabled(
  settings: Pick<
    OpsSettings,
    'terminalAuthPhoneEnabled' | 'terminalAuthNameDobEnabled' | 'terminalAuthEgkEnabled'
  >,
  authPath: string,
): boolean {
  if (!isGuardedTerminalAuthPath(authPath)) {
    return true;
  }

  if (authPath === 'phone_dob') {
    return settings.terminalAuthPhoneEnabled;
  }
  if (authPath === 'name_dob') {
    return settings.terminalAuthNameDobEnabled;
  }
  return settings.terminalAuthEgkEnabled;
}

export function assertTerminalAuthPathEnabled(
  settings: Pick<
    OpsSettings,
    'terminalAuthPhoneEnabled' | 'terminalAuthNameDobEnabled' | 'terminalAuthEgkEnabled'
  >,
  authPath: string,
): void {
  if (!isTerminalAuthPathEnabled(settings, authPath)) {
    throw domainError('CHECKIN_AUTH_PATH_DISABLED');
  }
}
