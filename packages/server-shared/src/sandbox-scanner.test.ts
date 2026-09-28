import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMaxSignatureAgeHours } from './sandbox-scanner.js';

test('resolveMaxSignatureAgeHours falls back to 48h', () => {
  assert.equal(resolveMaxSignatureAgeHours(undefined), 48);
  assert.equal(resolveMaxSignatureAgeHours(''), 48);
  assert.equal(resolveMaxSignatureAgeHours('24'), 24);
  assert.equal(resolveMaxSignatureAgeHours('0'), 48);
  assert.equal(resolveMaxSignatureAgeHours('-5'), 48);
});

test('resolveMaxSignatureAgeHours accepts positive values', () => {
  assert.equal(resolveMaxSignatureAgeHours('48'), 48);
});
