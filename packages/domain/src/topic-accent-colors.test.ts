import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultAccentForLane,
  normalizeTopicAccentColor,
  textColorOnAccent,
} from './topic-accent-colors.js';

test('normalizeTopicAccentColor lowercases valid hex', () => {
  assert.equal(normalizeTopicAccentColor('#7C3AED'), '#7c3aed');
});

test('defaultAccentForLane maps lane codes', () => {
  assert.equal(defaultAccentForLane('l'), '#7c3aed');
  assert.equal(defaultAccentForLane('unknown'), '#18181b');
});

test('textColorOnAccent picks readable foreground', () => {
  assert.equal(textColorOnAccent('#ffffff'), '#18181b');
  assert.equal(textColorOnAccent('#18181b'), '#ffffff');
});
