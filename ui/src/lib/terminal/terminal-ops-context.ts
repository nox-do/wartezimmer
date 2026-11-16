import type { TerminalPatientLocale } from '@wartezimmer/domain';

export type TerminalOpsSnapshot = {
  loading: boolean;
  deviceAuthorized: boolean;
  checkinLocked: boolean;
  terminalWlanPromoEnabled: boolean;
  terminalAuthPhoneEnabled: boolean;
  terminalAuthNameDobEnabled: boolean;
  terminalAuthEgkEnabled: boolean;
  terminalPatientLocales: TerminalPatientLocale[];
};
