import { TERMINAL_PATIENT_LOCALES, type TerminalPatientLocale } from '@wartezimmer/domain';
import type { AppLocale } from '$lib/i18n/core/I18nTypes';
import type { TranslationKey } from '$lib/i18n/core/translation-keys';
import { DEFAULT_LOCALE } from '$lib/i18n/core/I18nConfig';

type PatientLangTitleKey = Extract<TranslationKey, `terminal.lang${string}`>;

const PATIENT_LANGUAGE_META: Record<
  TerminalPatientLocale,
  { flag: string; code: string; titleKey: PatientLangTitleKey }
> = {
  'de-DE': { flag: '🇩🇪', code: 'DE', titleKey: 'terminal.langDe' },
  'en-GB': { flag: '🇬🇧', code: 'EN', titleKey: 'terminal.langEn' },
  'tr-TR': { flag: '🇹🇷', code: 'TR', titleKey: 'terminal.langTr' },
  'ru-RU': { flag: '🇷🇺', code: 'RU', titleKey: 'terminal.langRu' },
  'uk-UA': { flag: '🇺🇦', code: 'UK', titleKey: 'terminal.langUk' },
};

export type PatientLanguageOption = {
  locale: AppLocale;
  flag: string;
  code: string;
  titleKey: PatientLangTitleKey;
};

export const PATIENT_LANGUAGE_OPTIONS: readonly PatientLanguageOption[] =
  TERMINAL_PATIENT_LOCALES.map((locale) => ({
    locale,
    ...PATIENT_LANGUAGE_META[locale],
  }));

export function filterPatientLanguageOptions(
  enabledLocales: readonly TerminalPatientLocale[],
): PatientLanguageOption[] {
  const enabled = new Set(enabledLocales);
  return PATIENT_LANGUAGE_OPTIONS.filter((option) => enabled.has(option.locale));
}

export function resolvePatientLocaleAgainstEnabled(
  locale: AppLocale,
  enabledLocales: readonly TerminalPatientLocale[],
): AppLocale {
  if (enabledLocales.includes(locale)) {
    return locale;
  }
  return DEFAULT_LOCALE;
}
