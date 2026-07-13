import assert from 'node:assert/strict';
import test from 'node:test';
import { lastNamesMatch, normalizeLastNameForLookup } from './normalize-last-name.js';

test('normalizeLastNameForLookup trims and lowercases with German locale', () => {
  assert.equal(normalizeLastNameForLookup('  Müller '), 'müller');
  assert.equal(normalizeLastNameForLookup('MÜLLER'), 'müller');
});

test('normalizeLastNameForLookup respects Turkish dotted I rules', () => {
  assert.equal(normalizeLastNameForLookup('YILMAZ', 'tr-TR'), 'yılmaz');
  assert.equal(normalizeLastNameForLookup('İSTANBUL', 'tr-TR'), 'istanbul');
});

test('lastNamesMatch is case-insensitive and exact otherwise', () => {
  assert.equal(lastNamesMatch('müller', 'Müller'), true);
  assert.equal(lastNamesMatch('von braun', 'Von Braun'), true);
  assert.equal(lastNamesMatch('de la cruz', 'De la Cruz'), true);
  assert.equal(lastNamesMatch('Mueller', 'Müller'), false);
  assert.equal(lastNamesMatch('Schmidt', 'Schmid'), false);
  assert.equal(lastNamesMatch('yılmaz', 'Yılmaz'), true);
});
