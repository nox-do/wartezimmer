import test from 'node:test';
import assert from 'node:assert/strict';
import { assertLocationRemovable, locationReferences } from '@wartezimmer/flow-core';

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
      initialTargetLocationId: 'empfang',
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
  queues: [
    {
      id: 'reception_queue',
      name: 'Empfang',
      homeLocationId: 'empfang',
      type: 'reception' as const,
      sortPolicy: 'checkin_time' as const,
      callPolicy: 'manual' as const,
      defaultMovementMode: 'call' as const,
      active: true,
      sortOrder: 1,
    },
  ],
};

test('locationReferences: findet Topic-, Journey-, Routing-, Queue- und Visit-Referenzen', () => {
  assert.deepEqual(
    locationReferences(catalog, 'empfang', {
      topicDefaultRooms: [{ topicId: 'offen', defaultRoomId: 'empfang' }],
    }),
    [
      { kind: 'topic_default_room', id: 'offen' },
      { kind: 'routing_rule', id: 'rule_general' },
      { kind: 'queue_home', id: 'reception_queue' },
    ],
  );
  assert.deepEqual(locationReferences(catalog, 'labor'), [
    { kind: 'journey_step', id: 'step_lab' },
  ]);
  assert.deepEqual(
    locationReferences(catalog, 'raum_3', {
      visits: [
        { id: 'v1', status: 'waiting', lastKnownLocationId: 'raum_3' },
        { id: 'v2', status: 'called', targetLocationId: 'raum_3' },
      ],
    }),
    [
      { kind: 'visit_last_known', id: 'v1' },
      { kind: 'visit_target', id: 'v2' },
    ],
  );
});

test('locationReferences: ignoriert abgeschlossene Visits', () => {
  assert.deepEqual(
    locationReferences(catalog, 'raum_3', {
      visits: [{ id: 'v_done', status: 'done', targetLocationId: 'raum_3' }],
    }),
    [],
  );
});

test('locationReferences: zaehlt blocked Visits als offen', () => {
  assert.deepEqual(
    locationReferences(catalog, 'raum_3', {
      visits: [{ id: 'v_blocked', status: 'blocked', targetLocationId: 'raum_3' }],
    }),
    [{ kind: 'visit_target', id: 'v_blocked' }],
  );
});

test('assertLocationRemovable: blockiert referenzierte Locations und laesst freie zu', () => {
  assert.throws(() => assertLocationRemovable({ catalog, locationId: 'labor' }), /LOCATION_IN_USE/);
  assert.throws(
    () =>
      assertLocationRemovable({
        catalog,
        locationId: 'empfang',
        topicDefaultRooms: [{ topicId: 'offen', defaultRoomId: 'empfang' }],
      }),
    /LOCATION_IN_USE/,
  );
  assert.throws(
    () =>
      assertLocationRemovable({
        catalog,
        locationId: 'raum_3',
        visits: [{ id: 'v1', status: 'waiting', targetLocationId: 'raum_3' }],
      }),
    /LOCATION_IN_USE/,
  );
  assert.doesNotThrow(() => assertLocationRemovable({ catalog, locationId: 'unused_location' }));
});
