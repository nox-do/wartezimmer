export const TERMINAL_LAST_NAME_MAX_LENGTH = 160;

/** Union of characters allowed on terminal name keyboards (all patient locales). */
const TERMINAL_LAST_NAME_CHAR = /^[a-zA-ZäöüÄÖÜßğüşıöçĞÜŞİÖÇ\u0400-\u04FF -]$/;

export type TerminalLastNameIssue = 'empty' | 'too_long' | 'invalid_chars';

export function isAllowedTerminalLastNameChar(char: string): boolean {
  return char.length === 1 && TERMINAL_LAST_NAME_CHAR.test(char);
}

export function hasValidTerminalLastNameChars(value: string): boolean {
  return [...value].every((char) => isAllowedTerminalLastNameChar(char));
}

/**
 * Structured last-name issue for UX / assert mapping.
 * Unlike phone/DOB empty-while-typing, empty last name is always an issue when checked.
 */
export function getTerminalLastNameIssue(raw: string): TerminalLastNameIssue | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return 'empty';
  }
  if (trimmed.length > TERMINAL_LAST_NAME_MAX_LENGTH) {
    return 'too_long';
  }
  if (!hasValidTerminalLastNameChars(trimmed)) {
    return 'invalid_chars';
  }
  return null;
}

export function isValidTerminalLastName(raw: string): boolean {
  return getTerminalLastNameIssue(raw) === null;
}
