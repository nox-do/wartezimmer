export const TERMINAL_PATIENT_LOCALES = ['de-DE', 'en-GB', 'tr-TR', 'ru-RU', 'uk-UA'] as const;

export type TerminalPatientLocale = (typeof TERMINAL_PATIENT_LOCALES)[number];

export const OPTIONAL_TERMINAL_PATIENT_LOCALES = TERMINAL_PATIENT_LOCALES.filter(
  (locale) => locale !== 'de-DE',
);

export const DEFAULT_TERMINAL_PATIENT_LOCALES: TerminalPatientLocale[] = ['de-DE'];

const LOCALE_ORDER = new Map(TERMINAL_PATIENT_LOCALES.map((locale, index) => [locale, index]));

export function isTerminalPatientLocale(value: string): value is TerminalPatientLocale {
  return (TERMINAL_PATIENT_LOCALES as readonly string[]).includes(value);
}

export function normalizeTerminalPatientLocales(input: unknown): TerminalPatientLocale[] {
  if (!Array.isArray(input)) {
    return [...DEFAULT_TERMINAL_PATIENT_LOCALES];
  }

  const seen = new Set<TerminalPatientLocale>();
  for (const item of input) {
    if (typeof item === 'string' && isTerminalPatientLocale(item)) {
      seen.add(item);
    }
  }
  seen.add('de-DE');
  return [...seen].sort(
    (left, right) => (LOCALE_ORDER.get(left) ?? 0) - (LOCALE_ORDER.get(right) ?? 0),
  );
}

export function toggleTerminalPatientLocale(
  locales: readonly TerminalPatientLocale[],
  locale: TerminalPatientLocale,
  enabled: boolean,
): TerminalPatientLocale[] {
  if (locale === 'de-DE') {
    return normalizeTerminalPatientLocales(locales);
  }

  const next = new Set(normalizeTerminalPatientLocales(locales));
  if (enabled) {
    next.add(locale);
  } else {
    next.delete(locale);
  }
  return normalizeTerminalPatientLocales([...next]);
}

export function isTerminalPatientLocaleEnabled(
  locales: readonly TerminalPatientLocale[],
  locale: string,
): boolean {
  return normalizeTerminalPatientLocales(locales).includes(locale as TerminalPatientLocale);
}
