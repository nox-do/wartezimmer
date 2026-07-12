import test from 'node:test';
import assert from 'node:assert/strict';
import { assertActingLocationScope, assertCallTargetLocation } from '@praxis-flow/flow-core';
import { assertTransitionAllowed } from '@praxis-flow/flow-core';

const catalog = {
  locations: [{ id: 'room_1', name: 'Raum 1', active: true }],
};

test('assertActingLocationScope: Zielort muss passen', () => {
  const visit = { targetLocationId: 'room_1' };
  assert.doesNotThrow(() => assertActingLocationScope(visit, 'room_1'));
  assert.throws(() => assertActingLocationScope(visit, 'room_2'), /VISIT_LOCATION_MISMATCH/);
  assert.doesNotThrow(() => assertActingLocationScope(visit, undefined));
});

test('assertCallTargetLocation: unbekannter Ort blockiert', () => {
  assert.doesNotThrow(() => assertCallTargetLocation(catalog, 'room_1'));
  assert.throws(() => assertCallTargetLocation(catalog, 'missing'), /LOCATION_INACTIVE_OR_MISSING/);
});

test('assertTransitionAllowed: done ab arrived mit actingLocationId (Raum-Panel)', () => {
  const visit = { status: 'arrived', movementMode: 'call' };
  assert.doesNotThrow(() => assertTransitionAllowed(visit, 'done', { actingLocationId: 'room_1' }));
  assert.throws(() => assertTransitionAllowed(visit, 'done'), /DONE_ONLY_WHEN_IN_PROGRESS/);
});
