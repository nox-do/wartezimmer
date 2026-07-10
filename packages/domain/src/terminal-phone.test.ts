import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getTerminalPhoneSuffixIssue,
  isValidTerminalPhoneNumber,
  isValidTerminalPhoneSuffix,
  TERMINAL_PHONE_PREFIX,
  TERMINAL_PHONE_SUFFIX_MAX,
  TERMINAL_PHONE_SUFFIX_MIN,
} from './terminal-phone.js';

test('terminal phone constants', () => {
  assert.equal(TERMINAL_PHONE_PREFIX, '+49');
  assert.equal(TERMINAL_PHONE_SUFFIX_MIN, 9);
  assert.equal(TERMINAL_PHONE_SUFFIX_MAX, 11);
});

test('getTerminalPhoneSuffixIssue accepts 9–11 digit mobile suffix without leading zero', () => {
  assert.equal(getTerminalPhoneSuffixIssue('172111111'), null);
  assert.equal(getTerminalPhoneSuffixIssue('1512345678'), null);
  assert.equal(getTerminalPhoneSuffixIssue('15123456789'), null);
});

test('getTerminalPhoneSuffixIssue rejects leading zero, short, and invalid chars', () => {
  assert.equal(getTerminalPhoneSuffixIssue(''), null);
  assert.equal(getTerminalPhoneSuffixIssue('01512345678'), 'leading_zero');
  assert.equal(getTerminalPhoneSuffixIssue('1512'), 'too_short');
  assert.equal(getTerminalPhoneSuffixIssue('1512a45678'), 'invalid_chars');
});

test('isValidTerminalPhoneNumber accepts +49 mobile numbers with 9–11 digits', () => {
  assert.equal(isValidTerminalPhoneNumber('+49172111111'), true);
  assert.equal(isValidTerminalPhoneNumber('+49 1512345678'), true);
  assert.equal(isValidTerminalPhoneSuffix('172111111'), true);
});

test('isValidTerminalPhoneNumber rejects invalid numbers', () => {
  assert.equal(isValidTerminalPhoneNumber('+4901512345678'), false);
  assert.equal(isValidTerminalPhoneNumber('+491512'), false);
  assert.equal(isValidTerminalPhoneNumber(''), false);
  assert.equal(isValidTerminalPhoneNumber('1512345678'), false);
});
