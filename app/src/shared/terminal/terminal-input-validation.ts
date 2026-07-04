import { domainError } from '../errors/domain-error.js';
import { canonicalizeBirthDate } from '../contacts/canonicalize-birth-date.js';
import {
  hasValidTerminalLastNameChars,
  TERMINAL_LAST_NAME_MAX_LENGTH,
} from '../contacts/normalize-last-name.js';

const PHONE_SUFFIX_MIN = 9;
const PHONE_SUFFIX_MAX = 11;

function phoneSuffixDigits(input: string): string {
  const compact = input.replace(/\s+/g, '');
  if (!compact.startsWith('+49')) {
    return '';
  }
  return compact.slice(3).replace(/\D/g, '');
}

export function assertValidTerminalPhoneNumber(phoneNumber: string): void {
  const trimmed = phoneNumber.trim();
  if (trimmed.length === 0) {
    throw domainError('TERMINAL_PHONE_INVALID');
  }

  const suffix = phoneSuffixDigits(trimmed);
  const suffixRaw = trimmed.replace(/\s+/g, '').slice(3);
  if (suffix.length !== suffixRaw.replace(/\D/g, '').length || suffix.length !== suffixRaw.length) {
    throw domainError('TERMINAL_PHONE_INVALID');
  }
  if (suffix.startsWith('0')) {
    throw domainError('TERMINAL_PHONE_INVALID');
  }
  if (suffix.length < PHONE_SUFFIX_MIN || suffix.length > PHONE_SUFFIX_MAX) {
    throw domainError('TERMINAL_PHONE_INVALID');
  }
}

export function assertValidTerminalBirthDate(birthDate: string): void {
  if (!canonicalizeBirthDate(birthDate)) {
    throw domainError('TERMINAL_BIRTH_DATE_INVALID');
  }
}

export function assertValidTerminalLastName(lastName: string): void {
  const trimmed = lastName.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > TERMINAL_LAST_NAME_MAX_LENGTH ||
    !hasValidTerminalLastNameChars(trimmed)
  ) {
    throw domainError('TERMINAL_LAST_NAME_INVALID');
  }
}
