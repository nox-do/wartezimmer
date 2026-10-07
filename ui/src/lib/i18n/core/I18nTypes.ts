import {
  TERMINAL_PATIENT_LOCALES,
  isTerminalPatientLocale,
  type TerminalPatientLocale,
} from '@wartezimmer/domain';

/** UI locale — same codes as `TerminalPatientLocale` (canonical list in `@wartezimmer/domain`). */
export type AppLocale = TerminalPatientLocale;

export type TerminalLocale = TerminalPatientLocale;

export const APP_LOCALES = TERMINAL_PATIENT_LOCALES;

export { TERMINAL_PATIENT_LOCALES as TERMINAL_LOCALES };

export function isAppLocale(value: string): value is AppLocale {
  return isTerminalPatientLocale(value);
}

export type { AppDict } from './AppDict.js';
