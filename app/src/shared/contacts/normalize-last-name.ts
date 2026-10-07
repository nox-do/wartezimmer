import {
  hasValidTerminalLastNameChars,
  isAllowedTerminalLastNameChar,
  TERMINAL_LAST_NAME_MAX_LENGTH,
} from '@wartezimmer/domain';

export {
  hasValidTerminalLastNameChars,
  isAllowedTerminalLastNameChar,
  TERMINAL_LAST_NAME_MAX_LENGTH,
};

const NAME_LOOKUP_LOCALES = ['de-DE', 'tr-TR', 'en-GB', 'ru-RU', 'uk-UA'] as const;

export function normalizeLastNameForLookup(value: string, locale: string = 'de-DE'): string {
  return value.trim().toLocaleLowerCase(locale);
}

export function lastNamesMatch(needle: string, haystack: string): boolean {
  for (const locale of NAME_LOOKUP_LOCALES) {
    if (
      normalizeLastNameForLookup(needle, locale) === normalizeLastNameForLookup(haystack, locale)
    ) {
      return true;
    }
  }
  return false;
}
