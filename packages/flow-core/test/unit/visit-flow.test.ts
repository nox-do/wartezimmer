import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertTransitionAllowed,
  resolveReturnToWaitingTargetLocationId,
  resolveReturnToWaitingVisitPatch,
  statusForMovementMode,
  ACTIVE_VISIT_STATUSES,
  OPEN_VISIT_STATUSES,
  TERMINAL_VISIT_STATUSES,
} from '@praxis-flow/flow-core';
import type { Catalog, RoutingRule, Visit } from '@praxis-flow/flow-core';

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
    /CALL_ONLY_FOR_CALL_MOVEMENT/,
  );
});

test('assertTransitionAllowed: pickup start nur nach Ankunft', () => {
  const waitingPickup = { status: 'waiting', movementMode: 'pickup', needsAssistance: false };
  assert.throws(() => assertTransitionAllowed(waitingPickup, 'start'), /START_ONLY_WHEN_ARRIVED/);

  const afterArrive = { status: 'arrived', movementMode: 'pickup', needsAssistance: true };
  assert.doesNotThrow(() => assertTransitionAllowed(afterArrive, 'start'));
});

test('assertTransitionAllowed: return_to_waiting nur aus called/arrived/in_progress', () => {
  const base = { movementMode: 'call' as const, needsAssistance: false };
  assert.doesNotThrow(() =>
    assertTransitionAllowed({ ...base, status: 'called' }, 'return_to_waiting'),
  );
  assert.doesNotThrow(() =>
    assertTransitionAllowed({ ...base, status: 'arrived' }, 'return_to_waiting'),
  );
  assert.doesNotThrow(() =>
    assertTransitionAllowed({ ...base, status: 'in_progress' }, 'return_to_waiting'),
  );
  assert.throws(
    () => assertTransitionAllowed({ ...base, status: 'waiting' }, 'return_to_waiting'),
    /RETURN_TO_WAITING_NOT_ALLOWED/,
  );
  assert.throws(
    () => assertTransitionAllowed({ ...base, status: 'done' }, 'return_to_waiting'),
    /RETURN_TO_WAITING_NOT_ALLOWED/,
  );
});

const simpleRule: RoutingRule = {
  id: 'rule_general',
  topicId: 'general',
  name: 'General',
  initialTargetLocationId: 'reception',
  initialQueueId: 'general_queue',
  initialMovementMode: 'call',
  initialLocationConfidence: 'assumed',
  publicDisplayMode: 'visible',
  terminalInstructionTemplate: 'Bitte warten.',
  requiresReceptionConfirmation: false,
  escortPolicy: 'none',
  allowRedirect: true,
  active: true,
};

const journeyRule: RoutingRule = {
  ...simpleRule,
  id: 'rule_journey',
  journeyTemplateId: 'journey_general',
};

const catalogFixture: Catalog = {
  topics: [],
  locations: [],
  queues: [],
  surfaces: [],
  surfaceDisplayRules: [],
  journeyTemplates: [],
  journeySteps: [
    {
      id: 'step_0',
      templateId: 'journey_general',
      sortOrder: 0,
      targetLocationId: 'reception',
      queueId: 'general_queue',
      movementMode: 'call',
      publicDisplayMode: 'visible',
      completedWhen: 'arrive',
    },
    {
      id: 'step_1',
      templateId: 'journey_general',
      sortOrder: 1,
      targetLocationId: 'room_1',
      queueId: 'reception_queue',
      movementMode: 'call',
      publicDisplayMode: 'hidden',
      completedWhen: 'arrive',
    },
  ],
  routingRules: [simpleRule, journeyRule],
  patients: [],
};

test('resolveReturnToWaitingTargetLocationId: Simple behaelt Aufrufziel', () => {
  const visit = {
    targetLocationId: 'room_1',
    appliedRoutingRuleId: 'rule_general',
  } as Visit;

  assert.equal(resolveReturnToWaitingTargetLocationId(visit, simpleRule, catalogFixture), 'room_1');
});

test('resolveReturnToWaitingTargetLocationId: Simple Fallback auf Rule-Default', () => {
  const visit = {
    appliedRoutingRuleId: 'rule_general',
  } as Visit;

  assert.equal(
    resolveReturnToWaitingTargetLocationId(visit, simpleRule, catalogFixture),
    'reception',
  );
});

test('resolveReturnToWaitingTargetLocationId: Complex behält operatives Ziel', () => {
  const visit = {
    targetLocationId: 'room_1',
    appliedRoutingRuleId: 'rule_journey',
    journeyTemplateId: 'journey_general',
    journeyStepIndex: 0,
  } as Visit;

  assert.equal(
    resolveReturnToWaitingTargetLocationId(visit, journeyRule, catalogFixture),
    'room_1',
  );
});

test('resolveReturnToWaitingTargetLocationId: Complex behält operatives Ziel bei geänderter Rule', () => {
  const visit = {
    targetLocationId: 'room_1',
    appliedRoutingRuleId: 'rule_general',
    journeyTemplateId: 'journey_general',
    journeyStepIndex: 0,
  } as Visit;

  assert.equal(resolveReturnToWaitingTargetLocationId(visit, simpleRule, catalogFixture), 'room_1');
});

test('resolveReturnToWaitingVisitPatch setzt targetLocationId nicht auf undefined', () => {
  const visit = {
    status: 'called',
    movementMode: 'call',
    appliedRoutingRuleId: 'rule_general',
    targetLocationId: 'room_1',
    queueId: 'general_queue',
    lastKnownLocationId: 'room_1',
  } as Visit;

  const patch = resolveReturnToWaitingVisitPatch(visit, catalogFixture);

  assert.equal(patch.targetLocationId, 'room_1');
  assert.equal(patch.status, 'waiting');
  assert.equal(patch.calledAt, undefined);
});
