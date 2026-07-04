import type { TerminalAuthPath } from './terminal-api';
import type { TerminalOpsSnapshot } from './terminal-ops-context';

export type TerminalAuthRoutePath = Exclude<TerminalAuthPath, 'mfa_assist'>;

export function shouldRedirectFromTerminalAuthRoute(
  ops: TerminalOpsSnapshot,
  authPath: TerminalAuthRoutePath,
): boolean {
  if (ops.loading) {
    return false;
  }

  if (authPath === 'phone_dob') {
    return !ops.terminalAuthPhoneEnabled;
  }
  if (authPath === 'name_dob') {
    return !ops.terminalAuthNameDobEnabled;
  }
  return !ops.terminalAuthEgkEnabled;
}
