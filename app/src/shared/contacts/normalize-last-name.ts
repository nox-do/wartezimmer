/** Keep in sync with `ui/src/lib/terminal/terminal-last-name-locale.ts`. */
export const TERMINAL_LAST_NAME_MAX_LENGTH = 160;

const NAME_LOOKUP_LOCALES = ['de-DE', 'tr-TR', 'en-GB', 'ru-RU', 'uk-UA'] as const;

/** Union of characters allowed on terminal name keyboards (all patient locales). */
const TERMINAL_LAST_NAME_CHAR = /^[a-zA-ZäöüÄÖÜßğüşıöçĞÜŞİÖÇ\u0400-\u04FF -]$/;

export function isAllowedTerminalLastNameChar(char: string): boolean {
  return char.length === 1 && TERMINAL_LAST_NAME_CHAR.test(char);
}

export function hasValidTerminalLastNameChars(value: string): boolean {
  return [...value].every((char) => isAllowedTerminalLastNameChar(char));
}

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
