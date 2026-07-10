/** German mobile E.164 prefix used by the patient terminal. */
export const TERMINAL_PHONE_PREFIX = '+49';

/** After +49, without leading 0 — 9 digits e.g. 172111111 (demo CSV), up to 11 for longer mobiles. */
export const TERMINAL_PHONE_SUFFIX_MIN = 9;
export const TERMINAL_PHONE_SUFFIX_MAX = 11;

export type TerminalPhoneSuffixIssue =
  | 'invalid_chars'
  | 'leading_zero'
  | 'too_short'
  | 'too_long';

export function terminalPhoneSuffixDigits(suffix: string): string {
  return suffix.replace(/\D/g, '');
}

/**
 * Structured suffix issue for UX mapping.
 * Empty suffix → `null` (no error while typing).
 */
export function getTerminalPhoneSuffixIssue(suffix: string): TerminalPhoneSuffixIssue | null {
  const digits = terminalPhoneSuffixDigits(suffix);
  if (digits.length === 0) {
    return null;
  }
  if (digits.length !== suffix.replace(/\s/g, '').length) {
    return 'invalid_chars';
  }
  if (digits.startsWith('0')) {
    return 'leading_zero';
  }
  if (digits.length < TERMINAL_PHONE_SUFFIX_MIN) {
    return 'too_short';
  }
  if (digits.length > TERMINAL_PHONE_SUFFIX_MAX) {
    return 'too_long';
  }
  return null;
}

export function isValidTerminalPhoneSuffix(suffix: string): boolean {
  return (
    getTerminalPhoneSuffixIssue(suffix) === null &&
    terminalPhoneSuffixDigits(suffix).length >= TERMINAL_PHONE_SUFFIX_MIN
  );
}

function phoneSuffixFromE164(phoneNumber: string): { suffix: string; suffixRaw: string } | null {
  const compact = phoneNumber.replace(/\s+/g, '');
  if (!compact.startsWith(TERMINAL_PHONE_PREFIX)) {
    return null;
  }
  const suffixRaw = compact.slice(TERMINAL_PHONE_PREFIX.length);
  return {
    suffix: suffixRaw.replace(/\D/g, ''),
    suffixRaw,
  };
}

/** Full E.164 check for API payloads (`+49…`). */
export function isValidTerminalPhoneNumber(phoneNumber: string): boolean {
  const trimmed = phoneNumber.trim();
  if (trimmed.length === 0) {
    return false;
  }

  const parsed = phoneSuffixFromE164(trimmed);
  if (!parsed) {
    return false;
  }

  const { suffix, suffixRaw } = parsed;
  if (suffix.length !== suffixRaw.replace(/\D/g, '').length || suffix.length !== suffixRaw.length) {
    return false;
  }
  if (suffix.startsWith('0')) {
    return false;
  }
  return suffix.length >= TERMINAL_PHONE_SUFFIX_MIN && suffix.length <= TERMINAL_PHONE_SUFFIX_MAX;
}
