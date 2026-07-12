import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSurfaceRemovable, surfaceReferences } from '@praxis-flow/flow-core';

const catalog = {
  surfaceDisplayRules: [
    {
      id: 'tv_rule',
      surfaceId: 'waiting_tv',
      queueId: 'general_queue',
      locationId: undefined,
      topicId: undefined,
      displayMode: 'visible' as const,
      sortOrder: 10,
    },
  ],
  routingRules: [
    {
      id: 'rule_general',
      topicId: 'general',
      name: 'Allgemein',
      initialMovementMode: 'call' as const,
      initialLocationConfidence: 'assumed' as const,
      publicDisplayMode: 'visible' as const,
      terminalInstructionTemplate: 'Bitte warten.',
      requiresReceptionConfirmation: false,
      escortPolicy: 'none' as const,
      allowRedirect: true,
      allowedSurfaceIds: ['terminal_1'],
      active: true,
    },
  ],
};

test('surfaceReferences: findet Display-, Routing- und offene Visit-Referenzen', () => {
  assert.deepEqual(surfaceReferences(catalog, 'waiting_tv'), [
    { kind: 'display_rule', id: 'tv_rule' },
  ]);
  assert.deepEqual(surfaceReferences(catalog, 'terminal_1'), [
    { kind: 'routing_rule', id: 'rule_general' },
  ]);
  assert.deepEqual(
    surfaceReferences(catalog, 'terminal_2', [
      { id: 'v1', status: 'waiting', lastSurfaceId: 'terminal_2' },
    ]),
    [{ kind: 'visit', id: 'v1' }],
  );
});

test('surfaceReferences: ignoriert abgeschlossene Visits', () => {
  assert.deepEqual(
    surfaceReferences(catalog, 'terminal_2', [
      { id: 'v_done', status: 'done', lastSurfaceId: 'terminal_2' },
    ]),
    [],
  );
});

test('surfaceReferences: zaehlt blocked Visits als offen', () => {
  assert.deepEqual(
    surfaceReferences(catalog, 'terminal_2', [
      { id: 'v_blocked', status: 'blocked', lastSurfaceId: 'terminal_2' },
    ]),
    [{ kind: 'visit', id: 'v_blocked' }],
  );
});

test('assertSurfaceRemovable: blockiert verwendete Surfaces', () => {
  assert.throws(
    () => assertSurfaceRemovable({ catalog, surfaceId: 'waiting_tv' }),
    /SURFACE_IN_USE/,
  );
  assert.throws(
    () =>
      assertSurfaceRemovable({
        catalog,
        surfaceId: 'terminal_2',
        visits: [{ id: 'v1', status: 'waiting', lastSurfaceId: 'terminal_2' }],
      }),
    /SURFACE_IN_USE/,
  );
  assert.doesNotThrow(() => assertSurfaceRemovable({ catalog, surfaceId: 'unused_surface' }));
});
