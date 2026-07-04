import type { NameKeyboardLocale } from './terminal-name-keyboard-layout';

/** Keep in sync with `app/src/shared/contacts/normalize-last-name.ts`. */
export const TERMINAL_LAST_NAME_MAX_LENGTH = 160;

export type LastNameFieldErrorKey = 'terminal.nameRequired' | 'terminal.nameTooLong';

const LAST_NAME_CHAR_PATTERN: Record<NameKeyboardLocale, RegExp> = {
  'de-DE': /^[a-zA-ZäöüÄÖÜß -]$/,
  'en-GB': /^[a-zA-Z -]$/,
  // Turkish Q: dotted/dotless I are distinct letters.
  'tr-TR': /^[a-zA-ZğüşıöçĞÜŞİÖÇ -]$/,
  'ru-RU': /^[\u0400-\u04FF -]$/,
  'uk-UA': /^[\u0400-\u04FF -]$/,
};

export function resolveLastNameInputLocale(locale: string): NameKeyboardLocale {
  if (locale in LAST_NAME_CHAR_PATTERN) {
    return locale as NameKeyboardLocale;
  }
  return 'de-DE';
}

export function isAllowedLastNameChar(char: string, locale: string): boolean {
  return char.length === 1 && LAST_NAME_CHAR_PATTERN[resolveLastNameInputLocale(locale)].test(char);
}

export function formatLastNameDisplay(raw: string, locale: string): string {
  if (raw.length === 0) {
    return '';
  }
  const caseLocale = resolveLastNameInputLocale(locale);
  return raw.charAt(0).toLocaleUpperCase(caseLocale) + raw.slice(1);
}

function appendLastNameCharCore(current: string, char: string, locale: string): string {
  const caseLocale = resolveLastNameInputLocale(locale);
  if (char === ' ' || char === '-') {
    return `${current}${char}`;
  }
  return `${current}${char.toLocaleLowerCase(caseLocale)}`;
}

export function appendLastNameChar(current: string, char: string, locale: string): string {
  if (current.length >= TERMINAL_LAST_NAME_MAX_LENGTH || !isAllowedLastNameChar(char, locale)) {
    return current;
  }
  return appendLastNameCharCore(current, char, locale);
}

export function normalizeLastNameForSubmit(raw: string, locale: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return '';
  }
  const caseLocale = resolveLastNameInputLocale(locale);
  return (
    trimmed.charAt(0).toLocaleUpperCase(caseLocale) + trimmed.slice(1).toLocaleLowerCase(caseLocale)
  );
}

export function getLastNameFieldError(raw: string): LastNameFieldErrorKey | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return 'terminal.nameRequired';
  }
  if (trimmed.length > TERMINAL_LAST_NAME_MAX_LENGTH) {
    return 'terminal.nameTooLong';
  }
  return null;
}

export function isLastNameInputValid(raw: string): boolean {
  return getLastNameFieldError(raw) === null;
}
