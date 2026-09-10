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
