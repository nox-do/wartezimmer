import { DEFAULT_LOCALE, getBrowserLocale } from '$lib/i18n/core/I18nConfig';
import { isAppLocale, type AppLocale } from '$lib/i18n/core/I18nTypes';

/** Staff surfaces (MFA, Ops, TV) are German-only; see docs/architecture/i18n.md. */
export const STAFF_LOCALE: AppLocale = DEFAULT_LOCALE;

// Preserve the language preference stored by existing installations.
const PATIENT_LOCALE_KEY = 'praxis-flow-patient-locale';

export function getStoredPatientLocale(): AppLocale | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  const raw = localStorage.getItem(PATIENT_LOCALE_KEY);
  if (!raw || !isAppLocale(raw)) {
    return null;
  }

  return raw;
}

export function storePatientLocale(locale: AppLocale): void {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.setItem(PATIENT_LOCALE_KEY, locale);
}

export function getPatientInitialLocale(): AppLocale {
  return getStoredPatientLocale() ?? getBrowserLocale();
}

export function isTerminalPath(pathname: string): boolean {
  return pathname === '/terminal' || pathname.startsWith('/terminal/');
}

export function isPortalPath(pathname: string): boolean {
  return pathname === '/portal' || pathname.startsWith('/portal/');
}

export function isPatientFacingPath(pathname: string): boolean {
  return isTerminalPath(pathname) || isPortalPath(pathname);
}

export function getAppInitialLocale(
  pathname = typeof window !== 'undefined' ? window.location.pathname : '',
): AppLocale {
  if (isPatientFacingPath(pathname)) {
    return getPatientInitialLocale();
  }
  return STAFF_LOCALE;
}
