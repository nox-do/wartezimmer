import type { TerminalPatientLocale } from '@praxis-flow/domain';

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
