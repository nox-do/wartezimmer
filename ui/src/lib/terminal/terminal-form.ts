const PHONE_PREFIX = '+49';
/** After +49, without leading 0 — 9 digits e.g. 172111111 (demo CSV), up to 11 for longer mobiles. */
const PHONE_SUFFIX_MIN = 9;
const PHONE_SUFFIX_MAX = 11;

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

function phoneSuffixDigits(suffix: string): string {
  return suffix.replace(/\D/g, '');
}

export function getPhoneFieldError(suffix: string): TerminalFieldErrorKey | null {
  const digits = phoneSuffixDigits(suffix);
  if (digits.length === 0) {
    return null;
  }
  if (digits.length !== suffix.replace(/\s/g, '').length) {
    return 'terminal.phoneInvalidChars';
  }
  if (digits.startsWith('0')) {
    return 'terminal.phoneNoLeadingZero';
  }
  if (digits.length < PHONE_SUFFIX_MIN) {
    return 'terminal.phoneTooShort';
  }
  if (digits.length > PHONE_SUFFIX_MAX) {
    return 'terminal.phoneTooLong';
  }
  return null;
}

export function getDobFieldError(digits: string): TerminalFieldErrorKey | null {
  if (digits.length === 0) {
    return null;
  }
  if (digits.length < 8) {
    return 'terminal.dobIncomplete';
  }
  if (!/^\d{8}$/.test(digits)) {
    return 'terminal.dobInvalid';
  }

  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4, 8));

  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) {
    return 'terminal.dobInvalid';
  }

  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return 'terminal.dobInvalid';
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (parsed > today) {
    return 'terminal.dobFuture';
  }

  const oldest = new Date(today);
  oldest.setFullYear(today.getFullYear() - 120);
  if (parsed < oldest) {
    return 'terminal.dobInvalid';
  }

  return null;
}

export function isPhoneInputValid(prefix: string, suffix: string): boolean {
  return (
    getPhoneFieldError(suffix) === null && phoneSuffixDigits(suffix).length >= PHONE_SUFFIX_MIN
  );
}

export function isDobInputValid(digits: string): boolean {
  return getDobFieldError(digits) === null && digits.length === 8;
}

export function appendPhoneSuffixDigit(current: string, digit: string): string {
  if (!/^\d$/.test(digit)) {
    return current;
  }
  const next = `${phoneSuffixDigits(current)}${digit}`;
  if (next.length > PHONE_SUFFIX_MAX) {
    return current;
  }
  return next;
}

export { PHONE_PREFIX, PHONE_SUFFIX_MIN, PHONE_SUFFIX_MAX };
