import {
  getBirthDateIssue,
  getTerminalPhoneSuffixIssue,
  isValidTerminalPhoneSuffix,
  terminalPhoneSuffixDigits,
  TERMINAL_PHONE_PREFIX,
  TERMINAL_PHONE_SUFFIX_MAX,
  TERMINAL_PHONE_SUFFIX_MIN,
} from '@wartezimmer/domain';

export const PHONE_PREFIX = TERMINAL_PHONE_PREFIX;
export const PHONE_SUFFIX_MIN = TERMINAL_PHONE_SUFFIX_MIN;
export const PHONE_SUFFIX_MAX = TERMINAL_PHONE_SUFFIX_MAX;

export type TerminalFieldErrorKey =
  | 'terminal.phoneTooShort'
  | 'terminal.phoneTooLong'
  | 'terminal.phoneNoLeadingZero'
  | 'terminal.phoneInvalidChars'
  | 'terminal.nameRequired'
  | 'terminal.nameTooLong'
  | 'terminal.dobIncomplete'
  | 'terminal.dobInvalid'
  | 'terminal.dobFuture';

export function formatPhoneDisplay(prefix: string, suffix: string): string {
  if (suffix.length === 0) {
    return prefix;
  }
  return `${prefix} ${suffix}`;
}

export function formatDobFromDigits(digits: string): string {
  const d = digits.slice(0, 8);
  const dd = d.slice(0, 2);
  const mm = d.slice(2, 4);
  const yyyy = d.slice(4, 8);
  if (d.length <= 2) {
    return dd;
  }
  if (d.length <= 4) {
    return `${dd}.${mm}`;
  }
  return `${dd}.${mm}.${yyyy}`;
}

export function getPhoneFieldError(suffix: string): TerminalFieldErrorKey | null {
  const issue = getTerminalPhoneSuffixIssue(suffix);
  if (issue === null) {
    return null;
  }
  switch (issue) {
    case 'invalid_chars':
      return 'terminal.phoneInvalidChars';
    case 'leading_zero':
      return 'terminal.phoneNoLeadingZero';
    case 'too_short':
      return 'terminal.phoneTooShort';
    case 'too_long':
      return 'terminal.phoneTooLong';
  }
}

export function getDobFieldError(digits: string): TerminalFieldErrorKey | null {
  const issue = getBirthDateIssue(digits);
  if (issue === null) {
    return null;
  }
  switch (issue) {
    case 'incomplete':
      return 'terminal.dobIncomplete';
    case 'future':
      return 'terminal.dobFuture';
    case 'invalid':
      return 'terminal.dobInvalid';
  }
}

export function isPhoneInputValid(prefix: string, suffix: string): boolean {
  void prefix;
  return isValidTerminalPhoneSuffix(suffix);
}

export function isDobInputValid(digits: string): boolean {
  return getBirthDateIssue(digits) === null && digits.length === 8;
}

export function appendPhoneSuffixDigit(current: string, digit: string): string {
  if (!/^\d$/.test(digit)) {
    return current;
  }
  const next = `${terminalPhoneSuffixDigits(current)}${digit}`;
  if (next.length > TERMINAL_PHONE_SUFFIX_MAX) {
    return current;
  }
  return next;
}
