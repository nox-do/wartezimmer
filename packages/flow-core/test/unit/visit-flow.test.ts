import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertTransitionAllowed,
  statusForMovementMode,
  ACTIVE_VISIT_STATUSES,
  OPEN_VISIT_STATUSES,
  TERMINAL_VISIT_STATUSES
} from '@praxis-flow/flow-core';

test('Visit-Status-Sets: disjunkt und kanonisch', () => {
  for (const status of ACTIVE_VISIT_STATUSES) {
    assert.ok(!TERMINAL_VISIT_STATUSES.has(status), `${status} darf nicht terminal sein`);
    assert.ok(OPEN_VISIT_STATUSES.has(status), `${status} muss open sein`);
  }
  assert.ok(OPEN_VISIT_STATUSES.has('blocked'));
  assert.equal(OPEN_VISIT_STATUSES.size, ACTIVE_VISIT_STATUSES.size + 1);
  for (const status of TERMINAL_VISIT_STATUSES) {
    assert.ok(!OPEN_VISIT_STATUSES.has(status), `${status} darf nicht open sein`);
  }
});

test('statusForMovementMode', () => {
  assert.equal(statusForMovementMode('self_go'), 'directed');
  assert.equal(statusForMovementMode('call'), 'waiting');
  assert.equal(statusForMovementMode('pickup'), 'waiting');
});

test('assertTransitionAllowed: call nur aus waiting bei call movement', () => {
  const visit = { status: 'waiting', movementMode: 'call', needsAssistance: false };
  assert.doesNotThrow(() => assertTransitionAllowed(visit, 'call'));
  assert.throws(
    () => assertTransitionAllowed({ ...visit, movementMode: 'self_go' }, 'call'),
    /CALL_ONLY_FOR_CALL_MOVEMENT/
  );
});

test('assertTransitionAllowed: pickup start nur nach Ankunft', () => {
  const waitingPickup = { status: 'waiting', movementMode: 'pickup', needsAssistance: false };
  assert.throws(() => assertTransitionAllowed(waitingPickup, 'start'), /START_ONLY_WHEN_ARRIVED/);

  const afterArrive = { status: 'arrived', movementMode: 'pickup', needsAssistance: true };
  assert.doesNotThrow(() => assertTransitionAllowed(afterArrive, 'start'));
});
