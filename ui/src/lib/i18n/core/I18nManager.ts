import type { AppDict, AppLocale } from './I18nTypes';
import type { TranslationKey } from './translation-keys';

let currentLocale: AppLocale | null = null;
let currentDict: AppDict | null = null;
let inFlight: Promise<void> | null = null;

async function importLocale(locale: AppLocale): Promise<AppDict> {
  switch (locale) {
    case 'de-DE':
      return (await import('$lib/i18n/locales/de-DE')).dict;
    case 'en-GB':
      return (await import('$lib/i18n/locales/en-GB')).dict;
    case 'tr-TR':
      return (await import('$lib/i18n/locales/tr-TR')).dict;
    case 'ru-RU':
      return (await import('$lib/i18n/locales/ru-RU')).dict;
    case 'uk-UA':
      return (await import('$lib/i18n/locales/uk-UA')).dict;
    default:
      return (await import('$lib/i18n/locales/de-DE')).dict;
  }
}

export async function loadLocale(locale: AppLocale): Promise<void> {
  if (currentLocale === locale && currentDict) {
    return;
  }

  if (inFlight) {
    await inFlight;
    if (currentLocale === locale && currentDict) {
      return;
    }
  }

  inFlight = (async () => {
    currentLocale = locale;
    currentDict = await importLocale(locale);
  })();

  await inFlight;
  inFlight = null;
}

export function t(key: TranslationKey): string;
export function t(key: string): string;
export function t(key: string): string {
  if (!currentDict) {
    return key;
  }

  const parts = key.split('.');
  let obj: unknown = currentDict;
  for (const part of parts) {
    if (obj === null || obj === undefined || typeof obj !== 'object') {
      return key;
    }
    obj = (obj as Record<string, unknown>)[part];
  }

  return typeof obj === 'string' ? obj : key;
}

export function tf(key: TranslationKey, vars: Record<string, string | number>): string;
export function tf(key: string, vars: Record<string, string | number>): string;
export function tf(key: string, vars: Record<string, string | number>): string {
  let message = t(key);
  for (const [name, value] of Object.entries(vars)) {
    message = message.replaceAll(`{${name}}`, String(value));
  }
  return message;
}

export function getCurrentLocale(): AppLocale | null {
  return currentLocale;
}
