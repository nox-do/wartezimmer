import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { CoreDatabase } from './database.js';
import { getSandboxClient } from '../sandbox/sandbox-client.js';
import { withSandboxIntakeOperation } from '../sandbox/sandbox-intake-gate.js';

function openCoreDatabase(): { core: CoreDatabase; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'pf-db-placement-'));
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSandboxToken = process.env.SANDBOX_INTERNAL_TOKEN;
  process.env.SANDBOX_INTERNAL_TOKEN = 'checkout-test-token';
  const previousContactLookupBase = process.env.CONTACT_LOOKUP_BASE_PATH;
  process.env.NODE_ENV = 'test';
  process.env.CONTACT_LOOKUP_BASE_PATH = join(dir, 'imports');
  const core = new CoreDatabase(join(dir, 'wartezimmer.db'));
  return {
    core,
    cleanup: () => {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousContactLookupBase === undefined) delete process.env.CONTACT_LOOKUP_BASE_PATH;
      else process.env.CONTACT_LOOKUP_BASE_PATH = previousContactLookupBase;
      if (previousSandboxToken === undefined) delete process.env.SANDBOX_INTERNAL_TOKEN;
      else process.env.SANDBOX_INTERNAL_TOKEN = previousSandboxToken;
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

test('panel toggles preserve an active journey and its subsequent room transition', async (t) => {
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
    const session = core.resolvePatientSession(core.getTicketCodeByVisitId(visitId));
    const document = core.intakePatientDocument(session.sessionToken, {
      fileName: 'journey.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 20,
      status: 'scan_clean',
    });
    const deletion = t.mock.method(getSandboxClient(), 'deleteDocument', async () => {});
    core.placeVisitInRoom(visitId, firstRoom.roomId, firstRoom.roomLabel);
    assert.equal(core.listQueue().find((row) => row.id === visitId)?.dischargeDocumentCount, 0);
    await core.checkOutRoom(visitId, firstRoom.roomId);
    assert.equal(deletion.mock.callCount(), 0);
    assert.equal(core.getDocumentById(document.id).status, 'scan_clean');
    assert.equal(core.getPatientSession(session.sessionToken).status, 'active');
    assert.ok(runtime.visits().find((visit) => visit.id === visitId)?.journeyStepCompletedAt);
    core.continueJourney(visitId, 'labor');
    const advanced = runtime.visits().find((visit) => visit.id === visitId)!;
    assert.equal(advanced.journeyState, 'active');
    assert.equal(advanced.journeyStepIndex, 1);
    assert.equal(advanced.targetLocationId, 'labor');
    core.placeVisitInRoom(visitId, 'labor', 'Labor');
    assert.equal(core.listQueue().find((row) => row.id === visitId)?.dischargeDocumentCount, 1);
    const finished = await core.checkOutRoom(visitId, 'labor');
    assert.equal(finished.toStatus, 'done');
    assert.equal(deletion.mock.callCount(), 1);
    assert.equal(core.getDocumentById(document.id).status, 'discarded_by_mfa');
    assert.throws(() => core.getPatientSession(session.sessionToken));
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

test('MFA absence saves number and oral consent atomically and permits recall', () => {
  const { core, cleanup } = openCoreDatabase();
  try {
    const visitId = seedPlacementVisit(core);
    core.setAbsence(visitId, 'wait_here', {
      callbackPhone: '+49 176 12345678',
      recallConsentConfirmed: true,
      actorId: 'mfa-consent-test',
    });
    assert.equal(core.hasRecallNotifyConsent(visitId, '+4917612345678'), true);
    assert.equal(core.hasRecallNotifyConsent(visitId, '+4917612345679'), false);
    assert.equal(core.recallVisit(visitId, 15).callbackPhone, '+4917612345678');
  } finally {
    cleanup();
  }
});

test('MFA absence rolls back status and consent for an invalid phone or missing consent', () => {
  const { core, cleanup } = openCoreDatabase();
  try {
    const visitId = seedPlacementVisit(core);
    for (const notification of [
      { callbackPhone: '+4917612345678', recallConsentConfirmed: false },
      { callbackPhone: 'invalid', recallConsentConfirmed: true },
    ]) {
      assert.throws(() => core.setAbsence(visitId, 'wait_here', notification));
      assert.equal(core.listQueue().find((entry) => entry.id === visitId)?.status, 'waiting');
      assert.equal(core.hasRecallNotifyConsent(visitId, '+4917612345678'), false);
    }
  } finally {
    cleanup();
  }
});

test('MFA absence with an empty number revokes earlier consent and disables notification', () => {
  const { core, cleanup } = openCoreDatabase();
  try {
    const visitId = seedPlacementVisit(core);
    core.setAbsence(visitId, 'wait_here', {
      callbackPhone: '+4917612345678',
      recallConsentConfirmed: true,
    });
    core.setAbsence(visitId, 'wait_here', { callbackPhone: '', recallConsentConfirmed: false });
    assert.equal(core.hasRecallNotifyConsent(visitId, '+4917612345678'), false);
    assert.equal(core.recallVisit(visitId, 15).callbackPhone, null);
  } finally {
    cleanup();
  }
});

test('terminal check-in number alone cannot trigger recall notification', () => {
  const { core, cleanup } = openCoreDatabase();
  try {
    seedPlacementVisit(core);
    const { visitId } = core.createTicket({
      topicId: 'blut',
      authPath: 'phone_dob',
      checkinPhone: '+4917612345678',
      needsAssistance: true,
    });
    core.setAbsence(visitId, 'wait_here');
    assert.equal(core.recallVisit(visitId, 15).callbackPhone, null);
  } finally {
    cleanup();
  }
});

test('discharge deletes outstanding uploads and forms from all sessions, preserving exported documents', async (t) => {
  const { core, cleanup } = openCoreDatabase();
  try {
    const visitId = seedPlacementVisit(core);
    const ticketCode = core.getTicketCodeByVisitId(visitId);
    const first = core.resolvePatientSession(ticketCode);
    const upload = core.intakePatientDocument(first.sessionToken, {
      fileName: 'upload.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 20,
      status: 'preview_requested',
    });
    const exported = core.intakePatientDocument(first.sessionToken, {
      fileName: 'saved.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 20,
      status: 'exported',
    });
    const second = core.resolvePatientSession(ticketCode);
    const [form] = core.intakeFormDocuments(second.sessionToken, [
      {
        source: 'form',
        fileName: 'form.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 20,
        status: 'scan_clean',
        templateId: 'test-form',
        templateVersion: 1,
      },
    ]);
    const third = core.intakePatientDocument(second.sessionToken, {
      fileName: 'pending.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 20,
      status: 'received',
    });
    const scanning = core.intakePatientDocument(second.sessionToken, {
      fileName: 'scanning.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 20,
      status: 'scanning',
    });
    const deleted: string[] = [];
    t.mock.method(getSandboxClient(), 'deleteDocument', async (id: string) => {
      deleted.push(id);
    });
    core.placeVisitInRoom(visitId, 'labor', 'Labor');
    const eventsBefore = core.getFlowCoreRuntimeInstance().events(visitId).length;
    assert.equal((await core.checkOutRoom(visitId, 'labor')).toStatus, 'done');
    assert.deepEqual(deleted.sort(), [upload.id, form.id, third.id, scanning.id].sort());
    for (const id of deleted) assert.equal(core.getDocumentById(id).status, 'discarded_by_mfa');
    assert.equal(core.getDocumentById(exported.id).status, 'exported');
    assert.deepEqual(core.listDocumentsForVisit(visitId), []);
    assert.throws(() => core.getPatientSession(second.sessionToken));
    assert.throws(() => core.resolvePatientSession(ticketCode));
    assert.throws(() =>
      core.intakePatientDocument(second.sessionToken, {
        fileName: 'late.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 20,
        status: 'scan_clean',
      }),
    );
    assert.equal(core.getFlowCoreRuntimeInstance().events(visitId).length, eventsBefore + 1);
  } finally {
    cleanup();
  }
});

test('discharge validates scope before deleting and remains retryable after sandbox failure', async (t) => {
  const { core, cleanup } = openCoreDatabase();
  try {
    const visitId = seedPlacementVisit(core);
    const session = core.resolvePatientSession(core.getTicketCodeByVisitId(visitId));
    const document = core.intakePatientDocument(session.sessionToken, {
      fileName: 'upload.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 20,
      status: 'scan_clean',
    });
    const sandbox = getSandboxClient();
    const deletion = t.mock.method(sandbox, 'deleteDocument', async () => {
      assert.throws(() => core.supersedeVisit(visitId, 'blut'), /INVALID_TRANSITION/);
      throw new Error('SANDBOX_DELETE_UNREACHABLE');
    });
    core.placeVisitInRoom(visitId, 'labor', 'Labor');
    const before = core.getFlowCoreRuntimeInstance().events(visitId);
    await assert.rejects(() => core.checkOutRoom(visitId, 'wrong-room'));
    assert.equal(deletion.mock.callCount(), 0);
    await assert.rejects(() => core.checkOutRoom(visitId, 'labor'), /SANDBOX_DELETE_UNREACHABLE/);
    assert.equal(core.getDocumentById(document.id).status, 'scan_clean');
    assert.equal(core.getPatientSession(session.sessionToken).status, 'active');
    assert.equal(core.listQueue().find((item) => item.id === visitId)?.status, 'in_room');
    assert.deepEqual(core.getFlowCoreRuntimeInstance().events(visitId), before);
    deletion.mock.mockImplementation(async () => {});
    assert.equal((await core.checkOutRoom(visitId, 'labor')).toStatus, 'done');
    assert.equal(core.getDocumentById(document.id).status, 'discarded_by_mfa');
  } finally {
    cleanup();
  }
});

test('discharge drains in-flight uploads before deletion and rejects new document work', async (t) => {
  const { core, cleanup } = openCoreDatabase();
  let release!: () => void;
  const canFinish = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    const visitId = seedPlacementVisit(core);
    const session = core.resolvePatientSession(core.getTicketCodeByVisitId(visitId));
    core.placeVisitInRoom(visitId, 'labor', 'Labor');
    const deletion = t.mock.method(getSandboxClient(), 'deleteDocument', async () => {});
    const upload = withSandboxIntakeOperation(
      async () => {
        await canFinish;
        return core.intakePatientDocument(session.sessionToken, {
          fileName: 'late.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 20,
          status: 'scan_clean',
        });
      },
      () => false,
      visitId,
    );
    const checkout = core.checkOutRoom(visitId, 'labor');
    await assert.rejects(
      () =>
        withSandboxIntakeOperation(
          async () => {},
          () => false,
          visitId,
        ),
      /CHECKIN_LOCKED/,
    );
    assert.equal(deletion.mock.callCount(), 0);
    release();
    const document = await upload;
    assert.equal((await checkout).toStatus, 'done');
    assert.equal(core.getDocumentById(document.id).status, 'discarded_by_mfa');
  } finally {
    release();
    cleanup();
  }
});

test('partially failed discharge retries only remaining documents', async (t) => {
  const { core, cleanup } = openCoreDatabase();
  try {
    const visitId = seedPlacementVisit(core);
    const session = core.resolvePatientSession(core.getTicketCodeByVisitId(visitId));
    const documents = ['first.pdf', 'second.pdf'].map((fileName) =>
      core.intakePatientDocument(session.sessionToken, {
        fileName,
        mimeType: 'application/pdf',
        sizeBytes: 20,
        status: 'scan_clean',
      }),
    );
    const deleted: string[] = [];
    const deletion = t.mock.method(getSandboxClient(), 'deleteDocument', async (id: string) => {
      if (deleted.length === 1) throw new Error('SANDBOX_DELETE_UNREACHABLE');
      deleted.push(id);
    });
    core.placeVisitInRoom(visitId, 'labor', 'Labor');
    await assert.rejects(() => core.checkOutRoom(visitId, 'labor'), /SANDBOX_DELETE_UNREACHABLE/);
    assert.equal(deleted.length, 1);
    assert.equal(core.getDocumentById(deleted[0]).status, 'discarded_by_mfa');
    assert.equal(core.listDocumentsForVisit(visitId).length, 1);
    deletion.mock.mockImplementation(async (id: string) => {
      deleted.push(id);
    });
    assert.equal((await core.checkOutRoom(visitId, 'labor')).toStatus, 'done');
    assert.deepEqual(deleted.sort(), documents.map((doc) => doc.id).sort());
    assert.equal(deletion.mock.callCount(), 3);
  } finally {
    cleanup();
  }
});

test('discharge blocks competing visit transitions while sandbox deletion is awaiting', async (t) => {
  const { core, cleanup } = openCoreDatabase();
  try {
    const id = seedPlacementVisit(core);
    const session = core.resolvePatientSession(core.getTicketCodeByVisitId(id));
    const doc = core.intakePatientDocument(session.sessionToken, {
      fileName: 'race.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 20,
      status: 'scan_clean',
    });
    core.placeVisitInRoom(id, 'labor', 'Labor');
    t.mock.method(getSandboxClient(), 'deleteDocument', async () => {
      for (const transition of [
        () => core.returnToWaiting(id),
        () => core.cancelQueueVisit(id),
        () => core.reassignRoom(id, 'labor', 'Labor'),
        () => core.continueJourney(id),
        () => core.supersedeVisit(id, 'blut'),
      ]) {
        assert.throws(transition, /INVALID_TRANSITION/);
      }
      await assert.rejects(() => core.checkOutRoom(id), /INVALID_TRANSITION/);
    });
    assert.equal((await core.checkOutRoom(id, 'labor')).toStatus, 'done');
    assert.equal(core.getDocumentById(doc.id).status, 'discarded_by_mfa');
  } finally {
    cleanup();
  }
});
test('different visits can be discharged concurrently', async () => {
  const { core, cleanup } = openCoreDatabase();
  try {
    const a = seedPlacementVisit(core);
    const b = core.createTicket({
      topicId: 'blut',
      authPath: 'phone_dob',
      identityRef: 'Other',
      needsAssistance: true,
    }).visitId;
    const otherRoom = core
      .getOpsSettings()
      .rooms.find((room) => room.enabled && room.roomId !== 'labor')!;
    core.placeVisitInRoom(a, 'labor', 'Labor');
    core.placeVisitInRoom(b, otherRoom.roomId, otherRoom.roomLabel);
    const results = await Promise.all([core.checkOutRoom(a), core.checkOutRoom(b)]);
    assert.deepEqual(
      results.map((result) => result.toStatus),
      ['done', 'done'],
    );
  } finally {
    cleanup();
  }
});
