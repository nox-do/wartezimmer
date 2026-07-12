import test from 'node:test';
import assert from 'node:assert/strict';
import { assertQueueRemovable, queueReferences } from '@praxis-flow/flow-core';

const catalog = {
  journeySteps: [
    {
      id: 'step_lab',
      templateId: 'journey_lab',
      sortOrder: 1,
      targetLocationId: 'labor',
      queueId: 'lab_queue',
      movementMode: 'call' as const,
      publicDisplayMode: 'visible' as const,
      completedWhen: 'arrive' as const,
    },
  ],
  routingRules: [
    {
      id: 'rule_general',
      topicId: 'general',
      name: 'Allgemein',
      initialQueueId: 'general_queue',
      initialMovementMode: 'call' as const,
      initialLocationConfidence: 'assumed' as const,
      publicDisplayMode: 'visible' as const,
      terminalInstructionTemplate: 'Bitte warten.',
      requiresReceptionConfirmation: false,
      escortPolicy: 'none' as const,
      allowRedirect: true,
      active: true,
    },
  ],
  surfaceDisplayRules: [
    {
      id: 'tv_rule',
      surfaceId: 'waiting_tv',
      queueId: 'general_queue',
      displayMode: 'visible' as const,
      sortOrder: 10,
    },
  ],
};

test('queueReferences: findet Journey-, Routing-, Display- und Visit-Referenzen', () => {
  assert.deepEqual(queueReferences(catalog, 'lab_queue'), [
    { kind: 'journey_step', id: 'step_lab' },
  ]);
  assert.deepEqual(queueReferences(catalog, 'general_queue'), [
    { kind: 'routing_rule', id: 'rule_general' },
    { kind: 'display_rule', id: 'tv_rule' },
  ]);
  assert.deepEqual(
    queueReferences(catalog, 'assist_queue', [
      { id: 'v1', status: 'waiting', queueId: 'assist_queue' },
    ]),
    [{ kind: 'visit', id: 'v1' }],
  );
});

test('queueReferences: ignoriert abgeschlossene Visits', () => {
  assert.deepEqual(
    queueReferences(catalog, 'assist_queue', [
      { id: 'v_done', status: 'done', queueId: 'assist_queue' },
    ]),
    [],
  );
});

test('queueReferences: zaehlt blocked Visits als offen', () => {
  assert.deepEqual(
    queueReferences(catalog, 'assist_queue', [
      { id: 'v_blocked', status: 'blocked', queueId: 'assist_queue' },
    ]),
    [{ kind: 'visit', id: 'v_blocked' }],
  );
});

test('assertQueueRemovable: blockiert referenzierte Queues und laesst freie zu', () => {
  assert.throws(() => assertQueueRemovable({ catalog, queueId: 'general_queue' }), /QUEUE_IN_USE/);
  assert.throws(
    () =>
      assertQueueRemovable({
        catalog,
        queueId: 'assist_queue',
        visits: [{ id: 'v1', status: 'called', queueId: 'assist_queue' }],
      }),
    /QUEUE_IN_USE/,
  );
  assert.doesNotThrow(() => assertQueueRemovable({ catalog, queueId: 'unused_queue' }));
});
