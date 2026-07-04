import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalizePhone, phonesMatch } from './canonicalize-phone.js';

test('canonicalizePhone accepts explicit international numbers', () => {
  assert.equal(canonicalizePhone('+49 172 111111'), '+49172111111');
  assert.equal(canonicalizePhone('+436641234567'), '+436641234567');
});

test('canonicalizePhone normalizes German national and 00-prefix numbers', () => {
  assert.equal(canonicalizePhone('0172 111111'), '+49172111111');
  assert.equal(canonicalizePhone('0049172111111'), '+49172111111');
});

test('canonicalizePhone rejects empty and too-short numbers', () => {
  assert.equal(canonicalizePhone(''), null);
  assert.equal(canonicalizePhone('1234'), null);
});

test('phonesMatch compares different input formats', () => {
  assert.equal(phonesMatch('+49172111111', '0172111111'), true);
  assert.equal(phonesMatch('+436641234567', '0172111111'), false);
});
