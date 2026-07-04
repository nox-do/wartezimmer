import assert from 'node:assert/strict';
import test from 'node:test';
import { DomainError } from '../errors/domain-error.js';
import {
  assertTerminalAuthPathEnabled,
  assertKnownCheckinAuthPath,
  isTerminalAuthPathEnabled,
} from './terminal-auth-path.js';

const settings = {
  terminalAuthPhoneEnabled: true,
  terminalAuthNameDobEnabled: false,
  terminalAuthEgkEnabled: true,
};

test('isTerminalAuthPathEnabled respects ops settings for guarded paths', () => {
  assert.equal(isTerminalAuthPathEnabled(settings, 'phone_dob'), true);
  assert.equal(isTerminalAuthPathEnabled(settings, 'name_dob'), false);
  assert.equal(isTerminalAuthPathEnabled(settings, 'egk'), true);
});

test('isTerminalAuthPathEnabled allows mfa_assist', () => {
  assert.equal(isTerminalAuthPathEnabled(settings, 'mfa_assist'), true);
});

test('assertKnownCheckinAuthPath rejects unknown auth paths', () => {
  assert.throws(
    () => assertKnownCheckinAuthPath(''),
    (error: unknown) => error instanceof DomainError && error.domainCode === 'INVALID_ARGUMENT',
  );
  assert.throws(
    () => assertKnownCheckinAuthPath('custom'),
    (error: unknown) => error instanceof DomainError && error.domainCode === 'INVALID_ARGUMENT',
  );
});

test('assertKnownCheckinAuthPath accepts known auth paths', () => {
  assert.doesNotThrow(() => assertKnownCheckinAuthPath('phone_dob'));
  assert.doesNotThrow(() => assertKnownCheckinAuthPath('mfa_assist'));
});

test('assertTerminalAuthPathEnabled throws when path is disabled', () => {
  assert.throws(
    () => assertTerminalAuthPathEnabled(settings, 'name_dob'),
    (error: unknown) =>
      error instanceof DomainError && error.domainCode === 'CHECKIN_AUTH_PATH_DISABLED',
  );
});
