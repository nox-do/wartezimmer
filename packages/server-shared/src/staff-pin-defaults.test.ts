import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_STAFF_PIN, DEFAULT_STAFF_PIN_HASH } from './staff-pin-defaults.js';

test('DEFAULT_STAFF_PIN_HASH uses pbkdf2-sha256 format', () => {
  assert.equal(DEFAULT_STAFF_PIN, '0000');
  assert.match(DEFAULT_STAFF_PIN_HASH, /^pbkdf2-sha256\$100000\$/);
});
