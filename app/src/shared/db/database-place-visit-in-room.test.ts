import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { CoreDatabase } from './database.js';

function openCoreDatabase(): { core: CoreDatabase; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'pf-db-placement-'));
  const previousNodeEnv = process.env.NODE_ENV;
  const previousContactLookupBase = process.env.CONTACT_LOOKUP_BASE_PATH;
  process.env.NODE_ENV = 'test';
  process.env.CONTACT_LOOKUP_BASE_PATH = join(dir, 'imports');
  const core = new CoreDatabase(join(dir, 'praxis-flow.db'));
  return {
    core,
    cleanup: () => {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousContactLookupBase === undefined) delete process.env.CONTACT_LOOKUP_BASE_PATH;
      else process.env.CONTACT_LOOKUP_BASE_PATH = previousContactLookupBase;
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function seedPlacementVisit(core: CoreDatabase): string {
  const state = core.getDayLifecycleState();
  if (state.needsDayStartHint || state.checkinLocked) core.resetBusinessDay();
  if (core.getOpsState().checkinLocked) core.setCheckinLock(false);

  const current = core.getOpsSettings();
  core.updateOpsSettings({
    rooms: [
      ...current.rooms.map((room) => ({ ...room, defaultCallTarget: false })),
      {
        ...current.rooms[0]!,
        roomId: 'labor',
        roomLabel: 'Labor',
        enabled: true,
        defaultCallTarget: true,
      },
    ],
  });
  return core.createTicket({
    topicId: 'blut',
    authPath: 'phone_dob',
    identityRef: 'Placement Test',
    needsAssistance: true,
  }).visitId;
}

test('panel toggles persist while an occupied room and its visit stay intact', () => {
  const { core, cleanup } = openCoreDatabase();
  try {
    const visitId = seedPlacementVisit(core);
    core.placeVisitInRoom(visitId, 'labor', 'Labor');
    const before = core.listQueue().find((entry) => entry.id === visitId);
    for (const placement of ['inside', 'outside'] as const) {
      for (const enabled of [true, false]) {
        const current = core.getOpsSettings();
        const updated = core.updateOpsSettings({
          rooms: current.rooms.map((room) =>
            room.roomId !== 'labor'
              ? room
              : {
                  ...room,
                  panels: {
                    ...room.panels!,
                    [placement]: { ...room.panels![placement], enabled },
                  },
                },
          ),
        });
        assert.equal(
          updated.rooms.find((room) => room.roomId === 'labor')?.panels?.[placement].enabled,
          enabled,
        );
        assert.deepEqual(
          core.listQueue().find((entry) => entry.id === visitId),
          before,
        );
      }
    }
    assert.throws(() =>
      core.updateOpsSettings({
        rooms: core
          .getOpsSettings()
          .rooms.map((room) => (room.roomId === 'labor' ? { ...room, enabled: false } : room)),
      }),
    );
    assert.equal(
      core.getOpsSettings().rooms.find((room) => room.roomId === 'labor')?.enabled,
      true,
    );
  } finally {
    cleanup();
  }
});

test('panel toggles preserve an active journey and its subsequent room transition', () => {
  const { core, cleanup } = openCoreDatabase();
  try {
    core.resetBusinessDay();
    core.setCheckinLock(false);
    const initial = core.getOpsSettings();
    const firstRoom = initial.rooms.find((room) => room.enabled)!;
    const configured = core.updateOpsSettings({
      routingMode: 'complex',
      rooms: [
        ...initial.rooms,
        { ...firstRoom, roomId: 'labor', roomLabel: 'Labor', defaultCallTarget: false },
      ],
      topics: initial.topics.map((topic) =>
        topic.topicId === 'blut' ? { ...topic, journeyTemplateId: 'panel-test-journey' } : topic,
      ),
      journeySettings: {
        templates: [
          {
            id: 'panel-test-journey',
            name: 'Panel Test',
            topicId: 'blut',
            active: true,
            steps: [firstRoom.roomId, 'labor'].map((targetLocationId, index) => ({
              id: `panel-test-step-${index}`,
              sortOrder: index,
              targetLocationId,
              queueId: null,
              movementMode: 'call',
              publicDisplayMode: 'visible',
              completedWhen: 'done',
              instructionText: null,
            })),
          },
        ],
      },
    });
    const { visitId } = core.createTicket({
      topicId: 'blut',
      authPath: 'phone_dob',
      identityRef: 'Panel Journey Test',
      needsAssistance: false,
    });
    const runtime = core.getFlowCoreRuntimeInstance();
    const visitsBefore = runtime.visits();
    const visitBefore = visitsBefore.find((visit) => visit.id === visitId)!;
    assert.equal(visitBefore.journeyState, 'active');
    assert.equal(visitBefore.journeyStepIndex, 0);
    const eventsBefore = runtime.events(visitId);
    const catalogBefore = runtime.catalog();

    for (const placement of ['inside', 'outside'] as const) {
      for (const enabled of [true, false]) {
        const current = core.getOpsSettings();
        core.updateOpsSettings({
          rooms: current.rooms.map((room) => ({
            ...room,
            panels: { ...room.panels!, [placement]: { ...room.panels![placement], enabled } },
          })),
        });
        assert.deepEqual(runtime.visits(), visitsBefore);
        assert.deepEqual(runtime.events(visitId), eventsBefore);
        assert.deepEqual(core.getOpsSettings().journeySettings, configured.journeySettings);
        assert.deepEqual(runtime.catalog().locations, catalogBefore.locations);
      }
    }
    // A later journey destination remains protected, even before the patient arrives.
    for (const rooms of [
      core.getOpsSettings().rooms.filter((room) => room.roomId !== 'labor'),
      core
        .getOpsSettings()
        .rooms.map((room) => (room.roomId === 'labor' ? { ...room, enabled: false } : room)),
    ]) {
      assert.throws(() => core.updateOpsSettings({ rooms }));
      assert.deepEqual(core.getOpsSettings().rooms, configured.rooms);
    }
    core.placeVisitInRoom(visitId, firstRoom.roomId, firstRoom.roomLabel);
    core.checkOutRoom(visitId, firstRoom.roomId);
    assert.ok(runtime.visits().find((visit) => visit.id === visitId)?.journeyStepCompletedAt);
    core.continueJourney(visitId, 'labor');
    const advanced = runtime.visits().find((visit) => visit.id === visitId)!;
    assert.equal(advanced.journeyState, 'active');
    assert.equal(advanced.journeyStepIndex, 1);
    assert.equal(advanced.targetLocationId, 'labor');
  } finally {
    cleanup();
  }
});

test('placeVisitInRoom reports the full waiting-to-room transition and keeps audit actors', () => {
  const { core, cleanup } = openCoreDatabase();
  try {
    const visitId = seedPlacementVisit(core);
    const transition = core.placeVisitInRoom(
      visitId,
      'labor',
      'Veralteter Name',
      undefined,
      'mfa-session-1',
    );

    assert.deepEqual(transition, {
      fromStatus: 'waiting',
      toStatus: 'in_room',
      roomId: 'labor',
      roomLabel: 'Labor',
    });
    const row = core.listQueue().find((entry) => entry.id === visitId);
    assert.equal(row?.status, 'in_room');
    assert.equal(row?.roomId, 'labor');

    const placementEvents = core
      .getFlowCoreRuntimeInstance()
      .events(visitId)
      .filter((event) => event.type === 'target_reassigned' || event.type === 'arrived');
    assert.deepEqual(
      placementEvents.map((event) => event.type),
      ['target_reassigned', 'arrived'],
    );
    assert.ok(placementEvents.every((event) => event.actorId === 'mfa-session-1'));

    const statusEvent = core
      .claimPendingOutboxEvents(100, 1_000)
      .filter((event) => event.eventType === 'QueueStatusChanged')
      .map((event) => JSON.parse(event.payloadJson) as Record<string, unknown>)
      .find((payload) => payload.visitId === visitId);
    assert.equal(statusEvent?.fromStatus, 'waiting');
    assert.equal(statusEvent?.toStatus, 'in_room');
    assert.equal(statusEvent?.roomId, 'labor');
    assert.equal(statusEvent?.roomLabel, 'Labor');
  } finally {
    cleanup();
  }
});

test('placeVisitInRoom returns an absent visit and places it in the room atomically', () => {
  const { core, cleanup } = openCoreDatabase();
  try {
    const visitId = seedPlacementVisit(core);
    core.setAbsence(visitId, 'return_later');
    core.setCallbackPhone(visitId, '+49 176 12345678');
    core.recallVisit(visitId, 15);

    const absentRow = core.listQueue().find((entry) => entry.id === visitId);
    assert.equal(absentRow?.status, 'absent_return_later');
    assert.ok(absentRow?.returnUntil);
    assert.equal(absentRow?.callbackPhone, '+4917612345678');

    const transition = core.placeVisitInRoom(
      visitId,
      'labor',
      'Labor',
      undefined,
      'mfa-session-away',
    );

    assert.deepEqual(transition, {
      fromStatus: 'absent_return_later',
      toStatus: 'in_room',
      roomId: 'labor',
      roomLabel: 'Labor',
    });
    const row = core.listQueue().find((entry) => entry.id === visitId);
    assert.equal(row?.status, 'in_room');
    assert.equal(row?.roomId, 'labor');
    assert.equal(row?.callbackPhone, null);
    assert.equal(row?.returnUntil, null);
  } finally {
    cleanup();
  }
});

test('placeVisitInRoom keeps an absent visit absent when placement rolls back', () => {
  const { core, cleanup } = openCoreDatabase();
  try {
    const visitId = seedPlacementVisit(core);
    core.setAbsence(visitId, 'wait_here');
    const eventsBefore = core.getFlowCoreRuntimeInstance().events(visitId);
    const original = core.withTransaction.bind(core);
    core.withTransaction = ((operationName, fn) =>
      original(operationName, () => {
        fn();
        throw new Error('simulated absent placement failure');
      })) as typeof core.withTransaction;

    assert.throws(
      () => core.placeVisitInRoom(visitId, 'labor', 'Labor'),
      /simulated absent placement failure/,
    );

    const row = core.listQueue().find((entry) => entry.id === visitId);
    assert.equal(row?.status, 'absent_wait_here');
    assert.notEqual(row?.destinationRoomId, 'labor');
    assert.deepEqual(core.getFlowCoreRuntimeInstance().events(visitId), eventsBefore);
  } finally {
    cleanup();
  }
});

test('placeVisitInRoom rolls back every Core event and the outbox event on failure', () => {
  const { core, cleanup } = openCoreDatabase();
  try {
    const visitId = seedPlacementVisit(core);
    const eventsBefore = core.getFlowCoreRuntimeInstance().events(visitId);
    const outboxBefore = core.getOutboxStatus().readyCount;
    const original = core.withTransaction.bind(core);
    core.withTransaction = ((operationName, fn) =>
      original(operationName, () => {
        fn();
        throw new Error('simulated placement failure');
      })) as typeof core.withTransaction;

    assert.throws(
      () => core.placeVisitInRoom(visitId, 'labor', 'Labor', undefined, 'mfa-session-2'),
      /simulated placement failure/,
    );

    const row = core.listQueue().find((entry) => entry.id === visitId);
    assert.equal(row?.status, 'waiting');
    assert.notEqual(row?.destinationRoomId, 'labor');
    assert.deepEqual(core.getFlowCoreRuntimeInstance().events(visitId), eventsBefore);
    assert.equal(core.getOutboxStatus().readyCount, outboxBefore);
  } finally {
    cleanup();
  }
});
