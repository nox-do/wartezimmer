import assert from 'node:assert/strict';
import test from 'node:test';
import { DomainError } from '../errors/domain-error.js';
import { assertValidTerminalPhoneNumber } from './terminal-input-validation.js';

test('assertValidTerminalPhoneNumber accepts +49 mobile numbers with 9–11 digits', () => {
  assert.doesNotThrow(() => assertValidTerminalPhoneNumber('+49172111111'));
  assert.doesNotThrow(() => assertValidTerminalPhoneNumber('+49 1512345678'));
});

test('assertValidTerminalPhoneNumber rejects invalid numbers', () => {
  assert.throws(() => assertValidTerminalPhoneNumber('+4901512345678'), DomainError);
  assert.throws(() => assertValidTerminalPhoneNumber('+491512'), DomainError);
  assert.throws(() => assertValidTerminalPhoneNumber(''), DomainError);
});
