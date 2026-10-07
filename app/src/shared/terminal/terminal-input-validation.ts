import {
  canonicalizeBirthDate,
  isValidTerminalLastName,
  isValidTerminalPhoneNumber,
} from '@wartezimmer/domain';
import { domainError } from '../errors/domain-error.js';

export function assertValidTerminalPhoneNumber(phoneNumber: string): void {
  if (!isValidTerminalPhoneNumber(phoneNumber)) {
    throw domainError('TERMINAL_PHONE_INVALID');
  }
}

export function assertValidTerminalBirthDate(birthDate: string): void {
  if (!canonicalizeBirthDate(birthDate)) {
    throw domainError('TERMINAL_BIRTH_DATE_INVALID');
  }
}

export function assertValidTerminalLastName(lastName: string): void {
  if (!isValidTerminalLastName(lastName)) {
    throw domainError('TERMINAL_LAST_NAME_INVALID');
  }
}
