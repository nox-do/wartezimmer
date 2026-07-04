import type { AppLocale } from './I18nTypes';
import { isAppLocale } from './I18nTypes';

export const DEFAULT_LOCALE: AppLocale = 'de-DE';

export function normalizeLocale(value: string | undefined): AppLocale {
  if (value && isAppLocale(value)) {
    return value;
  }
  return DEFAULT_LOCALE;
}

export function getBrowserLocale(): AppLocale {
  if (typeof navigator === 'undefined') {
    return DEFAULT_LOCALE;
  }

  const language = navigator.language.toLowerCase();
  if (language.startsWith('de')) {
    return 'de-DE';
  }
  if (language.startsWith('tr')) {
    return 'tr-TR';
  }
  if (language.startsWith('uk')) {
    return 'uk-UA';
  }
  if (language.startsWith('ru')) {
    return 'ru-RU';
  }
  if (language.startsWith('en')) {
    return 'en-GB';
  }

  return DEFAULT_LOCALE;
}
