import type { TerminalPatientLocale } from '@praxis-flow/domain';

export const TERMINAL_OPS_CONTEXT_KEY = Symbol('terminal-ops');

export type TerminalOpsSnapshot = {
  loading: boolean;
  deviceAuthorized: boolean;
  checkinLocked: boolean;
  emergencyEnabled: boolean;
  terminalWlanPromoEnabled: boolean;
  terminalAuthPhoneEnabled: boolean;
  terminalAuthNameDobEnabled: boolean;
  terminalAuthEgkEnabled: boolean;
  terminalPatientLocales: TerminalPatientLocale[];
  emergencyActive: boolean;
};
