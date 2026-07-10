import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getTerminalLastNameIssue,
  hasValidTerminalLastNameChars,
  isValidTerminalLastName,
  TERMINAL_LAST_NAME_MAX_LENGTH,
} from './terminal-last-name.js';

test('hasValidTerminalLastNameChars accepts terminal keyboard charsets', () => {
  assert.equal(hasValidTerminalLastNameChars('Müller-Schmidt'), true);
  assert.equal(hasValidTerminalLastNameChars('Yılmaz'), true);
  assert.equal(hasValidTerminalLastNameChars('Иванов'), true);
  assert.equal(hasValidTerminalLastNameChars('Smith@'), false);
});

test('getTerminalLastNameIssue / isValidTerminalLastName', () => {
  assert.equal(getTerminalLastNameIssue('Müller'), null);
  assert.equal(isValidTerminalLastName('Müller'), true);
  assert.equal(getTerminalLastNameIssue('   '), 'empty');
  assert.equal(getTerminalLastNameIssue('a'.repeat(TERMINAL_LAST_NAME_MAX_LENGTH + 1)), 'too_long');
  assert.equal(getTerminalLastNameIssue('Müller@'), 'invalid_chars');
  assert.equal(isValidTerminalLastName('Yılmaz'), true);
  assert.equal(isValidTerminalLastName('Иванов'), true);
});
