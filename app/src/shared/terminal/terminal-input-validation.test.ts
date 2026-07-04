import assert from 'node:assert/strict';
import test from 'node:test';
import { DomainError } from '../errors/domain-error.js';
import {
  assertValidTerminalBirthDate,
  assertValidTerminalLastName,
  assertValidTerminalPhoneNumber,
} from './terminal-input-validation.js';

test('assertValidTerminalPhoneNumber accepts +49 mobile numbers with 9–11 digits', () => {
  assert.doesNotThrow(() => assertValidTerminalPhoneNumber('+49172111111'));
  assert.doesNotThrow(() => assertValidTerminalPhoneNumber('+49 1512345678'));
});

test('assertValidTerminalPhoneNumber rejects invalid numbers', () => {
  assert.throws(() => assertValidTerminalPhoneNumber('+4901512345678'), DomainError);
  assert.throws(() => assertValidTerminalPhoneNumber('+491512'), DomainError);
  assert.throws(() => assertValidTerminalPhoneNumber(''), DomainError);
});

test('assertValidTerminalBirthDate accepts DD.MM.YYYY, digit-only, and ISO dates', () => {
  assert.doesNotThrow(() => assertValidTerminalBirthDate('15.06.1990'));
  assert.doesNotThrow(() => assertValidTerminalBirthDate('15061990'));
  assert.doesNotThrow(() => assertValidTerminalBirthDate('1990-01-15'));
});

test('assertValidTerminalBirthDate rejects incomplete or future dates', () => {
  assert.throws(() => assertValidTerminalBirthDate('15.06'), DomainError);
  assert.throws(() => assertValidTerminalBirthDate('01.01.2099'), DomainError);
});

test('assertValidTerminalLastName rejects empty or oversized values', () => {
  assert.doesNotThrow(() => assertValidTerminalLastName('Müller'));
  assert.throws(() => assertValidTerminalLastName('   '), DomainError);
  assert.throws(() => assertValidTerminalLastName('a'.repeat(161)), DomainError);
});

test('assertValidTerminalLastName rejects disallowed characters', () => {
  assert.throws(() => assertValidTerminalLastName('Müller@'), DomainError);
  assert.throws(() => assertValidTerminalLastName('Smith123'), DomainError);
  assert.doesNotThrow(() => assertValidTerminalLastName('Yılmaz'));
  assert.doesNotThrow(() => assertValidTerminalLastName('Иванов'));
});
