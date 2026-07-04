import assert from 'node:assert/strict';
import test from 'node:test';
import { cycleTriageLevel, normalizeTriageLevel } from './queue-triage.js';

test('cycleTriageLevel rotates none → green → yellow → red → none', () => {
  assert.equal(cycleTriageLevel(null), 'green');
  assert.equal(cycleTriageLevel(undefined), 'green');
  assert.equal(cycleTriageLevel('green'), 'yellow');
  assert.equal(cycleTriageLevel('yellow'), 'red');
  assert.equal(cycleTriageLevel('red'), null);
});

test('normalizeTriageLevel rejects unknown values', () => {
  assert.equal(normalizeTriageLevel('red'), 'red');
  assert.equal(normalizeTriageLevel('blue'), null);
  assert.equal(normalizeTriageLevel(''), null);
});
