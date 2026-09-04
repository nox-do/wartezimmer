import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_TERMINAL_TOPIC_DEFINITIONS } from '../checkin-topic-settings.js';
import { normalizeRoomPanelsSettings } from '@praxis-flow/domain';
import { DomainError } from '../errors/domain-error.js';
import { QUEUE_ROOM_MISMATCH } from '../queue/queue-room-scope.js';
import { ensureFlowCoreSchema } from './flow-core-schema.js';
import { syncFlowCoreCatalog, getFlowCoreRuntime } from './flow-core-runtime.js';
import { createVisitCheckInInDb } from './flow-core-checkin.js';
import {
  arriveVisit,
  callVisit,
  cancelVisit,
  completeVisit,
  continueJourneyVisit,
  cycleVisitTriageLevel,
  listVisitQueueRows,
  recallVisit,
  returnAbsentVisitToQueue,
  returnVisitToWaiting,
  reassignVisitRoom,
  setVisitAbsent,
  setVisitCallbackPhone,
  startVisit,
  visitStatusToQueueDisplayStatus,
  visitToQueueVisitRow,
} from './visit-queue-bridge.js';
import { setVisitAbsentMode, upsertVisitHostState } from '../db/visit-host-state.js';
import { getBusinessDay } from '../db/database-time.js';
import type { CheckinSessionDeps } from '../db/database-checkin-sessions.js';
import type { OpsSettings } from '../db/db-types.js';
import { normalizeDayClosePhase } from '../db/database-time.js';

function sampleSettings(): OpsSettings {
  return {
    routingMode: 'simple',
    returnWindowMinutes: 15,
    practiceOpenFrom: '00:00',
    practiceOpenTo: '23:59',
    practiceProfileJson: '{}',
    topics: DEFAULT_TERMINAL_TOPIC_DEFINITIONS,
    journeySettings: { templates: [] },
    rooms: [
      {
        roomId: 'mfa-tresen',
        roomLabel: 'Empfang',
        enabled: true,
        defaultCallTarget: true,
        maxOccupancy: null,
        panels: normalizeRoomPanelsSettings(null),
      },
      {
        roomId: 'labor',
        roomLabel: 'Labor',
        enabled: true,
        defaultCallTarget: false,
        maxOccupancy: null,
        panels: normalizeRoomPanelsSettings({
          outside: {
            enabled: true,
            mode: 'arrival',
            showPatientNames: false,
            calledTextPreset: 'please_enter',
            calledTextCustom: null,
            arrivedTextPreset: 'please_wait_here',
            arrivedTextCustom: null,
          },
        }),
      },
    ],
    contactLookupFolderPath: null,
    contactLookupDelimiterMode: 'auto',
    contactLookupHasHeader: true,
    contactLookupMappingJson: '{}',
    emergencyEnabled: false,
    terminalWlanPromoEnabled: false,
    terminalAuthPhoneEnabled: true,
    terminalAuthNameDobEnabled: true,
    terminalAuthEgkEnabled: false,
    terminalPatientLocales: [],
    smsProvider: 'vonage',
    exportBasePath: '/tmp',
    updatedAt: '2026-07-04T12:00:00.000Z',
  };
}

function buildDeps(
  db: DatabaseSync,
  settings: OpsSettings,
): CheckinSessionDeps & { db: DatabaseSync } {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ops_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      checkin_locked INTEGER NOT NULL DEFAULT 0,
      day_close_phase TEXT NOT NULL DEFAULT 'open',
      last_reset_business_day TEXT,
      updated_at TEXT NOT NULL
    );
    INSERT OR IGNORE INTO ops_state (id, checkin_locked, day_close_phase, last_reset_business_day, updated_at)
    VALUES (1, 0, 'open', '${getBusinessDay()}', '2026-07-04T12:00:00.000Z');
  `);

  const dayCloseStateStmt = db.prepare(
    'SELECT checkin_locked AS locked, day_close_phase AS phase, last_reset_business_day AS lastResetBusinessDay FROM ops_state WHERE id = 1',
  );
  const checkinLockStmt = db.prepare('SELECT checkin_locked AS locked FROM ops_state WHERE id = 1');

  return {
    db,
    findTicketByCodeStmt: db.prepare('SELECT 1'),
    checkinLockStmt,
    dayCloseStateStmt,
    updateCheckinLockStmt: db.prepare('SELECT 1'),
    getVisitIdentityViewStmt: db.prepare('SELECT 1'),
    getVisitPortalContextStmt: db.prepare('SELECT 1'),
    insertPatientSessionStmt: db.prepare('SELECT 1'),
    expireActiveSessionsByVisitStmt: db.prepare('SELECT 1'),
    getActiveSessionByVisitStmt: db.prepare('SELECT 1'),
    getPatientSessionByTokenStmt: db.prepare('SELECT 1'),
    touchPatientSessionStmt: db.prepare('SELECT 1'),
    expirePatientSessionStmt: db.prepare('SELECT 1'),
    revokePatientSessionStmt: db.prepare('SELECT 1'),
    nowIso: () => '2026-07-04T12:00:00.000Z',
    getBusinessDay,
    getBusinessTimeZone: () => 'Europe/Berlin',
    getOpsSettings: () => settings,
    normalizeDayClosePhase,
    emitOutboxEvent: () => undefined,
  };
}

function setupVisitFlow(): {
  db: DatabaseSync;
  settings: OpsSettings;
  visitId: string;
  runtime: ReturnType<typeof getFlowCoreRuntime>;
  listQueue: () => ReturnType<typeof listVisitQueueRows>;
} {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  ensureFlowCoreSchema(db);
  const settings = sampleSettings();
  syncFlowCoreCatalog(db, settings);
  const created = createVisitCheckInInDb(buildDeps(db, settings), {
    topicId: 'blut',
    authPath: 'phone_dob',
    identityRef: 'Transition Test',
  });
  const runtime = getFlowCoreRuntime(db);
  const listQueue = () => listVisitQueueRows(runtime, settings, getBusinessDay(), db);
  return { db, settings, visitId: created.visitId, runtime, listQueue };
}

function setupComplexVisitFlow(): ReturnType<typeof setupVisitFlow> {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  ensureFlowCoreSchema(db);
  const baseSettings = sampleSettings();
  const settings: OpsSettings = {
    ...baseSettings,
    routingMode: 'complex',
    topics: baseSettings.topics.map((topic) =>
      topic.topicId === 'blut' ? { ...topic, journeyTemplateId: 'journey_blut' } : topic,
    ),
    journeySettings: {
      templates: [
        {
          id: 'journey_blut',
          name: 'Blut Complex',
          topicId: 'blut',
          active: true,
          steps: [
            {
              id: 'step_blut_0',
              sortOrder: 0,
              targetLocationId: 'mfa-tresen',
              queueId: 'pf_general_queue',
              movementMode: 'call',
              publicDisplayMode: 'visible',
              completedWhen: 'arrive',
              instructionText: null,
            },
            {
              id: 'step_blut_1',
              sortOrder: 1,
              targetLocationId: 'labor',
              queueId: 'pf_general_queue',
              movementMode: 'call',
              publicDisplayMode: 'hidden',
              completedWhen: 'done',
              instructionText: null,
            },
          ],
        },
      ],
    },
  };
  syncFlowCoreCatalog(db, settings);
  const created = createVisitCheckInInDb(buildDeps(db, settings), {
    topicId: 'blut',
    authPath: 'phone_dob',
    identityRef: 'Complex Test',
  });
  const runtime = getFlowCoreRuntime(db);
  const listQueue = () => listVisitQueueRows(runtime, settings, getBusinessDay(), db);
  return { db, settings, visitId: created.visitId, runtime, listQueue };
}

test('visitStatusToQueueDisplayStatus maps arrived and in_progress to in_room', () => {
  assert.equal(visitStatusToQueueDisplayStatus('arrived'), 'in_room');
  assert.equal(visitStatusToQueueDisplayStatus('in_progress'), 'in_room');
  assert.equal(visitStatusToQueueDisplayStatus('directed'), 'directed');
  assert.equal(visitStatusToQueueDisplayStatus('done'), 'done');
});

test('visit flow call → arrive → done end-to-end', () => {
  const { db, settings, visitId, runtime, listQueue } = setupVisitFlow();

  const call = callVisit(db, runtime, settings, listQueue, visitId, 'labor', 'Labor');
  assert.deepEqual(call, { fromStatus: 'waiting', toStatus: 'called' });

  let rows = listQueue();
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.status, 'called');
  assert.equal(rows[0]?.roomId, 'labor');

  const arrive = arriveVisit(db, runtime, visitId);
  assert.deepEqual(arrive, { fromStatus: 'called', toStatus: 'in_room' });

  rows = listQueue();
  assert.equal(rows[0]?.status, 'in_room');
  assert.equal(rows[0]?.roomId, 'labor');

  const done = completeVisit(runtime, visitId);
  assert.deepEqual(done, { fromStatus: 'in_room', toStatus: 'done' });

  rows = listQueue();
  assert.equal(rows.length, 0);
});

test('MFA done from arrived auto-starts before completing', () => {
  const { visitId, runtime, settings, listQueue, db } = setupVisitFlow();
  callVisit(db, runtime, settings, listQueue, visitId, 'labor', 'Labor');
  arriveVisit(db, runtime, visitId);

  const done = completeVisit(runtime, visitId);
  assert.deepEqual(done, { fromStatus: 'in_room', toStatus: 'done' });

  const visit = db
    .prepare('SELECT status, started_at AS startedAt FROM visits WHERE id = ?')
    .get(visitId) as { status?: string; startedAt?: string | null } | undefined;
  assert.equal(visit?.status, 'done');
  assert.ok(visit?.startedAt);
});

test('startVisit marks treatment started while staying in_room', () => {
  const { visitId, runtime, settings, listQueue, db } = setupVisitFlow();
  callVisit(db, runtime, settings, listQueue, visitId, 'labor', 'Labor');
  arriveVisit(db, runtime, visitId);

  const before = listQueue()[0];
  assert.equal(before?.startedAt, null);

  const started = startVisit(runtime, visitId, 'labor');
  assert.deepEqual(started, { fromStatus: 'in_room', toStatus: 'in_room' });

  const after = listQueue()[0];
  assert.ok(after?.startedAt);
  assert.equal(after?.status, 'in_room');
});

test('continueJourneyVisit applies next call hop from completed step', () => {
  const { db, settings, visitId, runtime, listQueue } = setupComplexVisitFlow();

  callVisit(db, runtime, settings, listQueue, visitId, 'mfa-tresen', 'Empfang');
  arriveVisit(db, runtime, visitId, 'mfa-tresen');
  let visit = runtime.visits().find((entry) => entry.id === visitId);
  assert.ok(visit?.journeyStepCompletedAt);

  const continued = continueJourneyVisit(runtime, visitId);
  assert.deepEqual(continued, { fromStatus: 'in_room', toStatus: 'waiting' });

  visit = runtime.visits().find((entry) => entry.id === visitId);
  assert.equal(visit?.journeyStepIndex, 1);
  assert.equal(visit?.journeyStepCompletedAt, undefined);
  assert.equal(visit?.targetLocationId, 'labor');
  assert.equal(visit?.status, 'waiting');
});

test('callVisit starts pending next call journey step before calling', () => {
  const { db, settings, visitId, runtime, listQueue } = setupComplexVisitFlow();

  callVisit(db, runtime, settings, listQueue, visitId, 'mfa-tresen', 'Empfang');
  arriveVisit(db, runtime, visitId, 'mfa-tresen');
  let visit = runtime.visits().find((entry) => entry.id === visitId);
  assert.equal(visit?.journeyStepIndex, 0);
  assert.ok(visit?.journeyStepCompletedAt);
  assert.equal(visit?.targetLocationId, 'mfa-tresen');

  const call = callVisit(db, runtime, settings, listQueue, visitId, 'mfa-tresen', 'Empfang');
  assert.deepEqual(call, { fromStatus: 'in_room', toStatus: 'called' });
  visit = runtime.visits().find((entry) => entry.id === visitId);
  assert.equal(visit?.journeyStepIndex, 1);
  assert.equal(visit?.journeyStepCompletedAt, undefined);
  assert.equal(visit?.targetLocationId, 'labor');
  assert.equal(visit?.status, 'called');
});

test('scoped arrive succeeds when acting room matches target', () => {
  const { db, visitId, runtime, settings, listQueue } = setupVisitFlow();
  callVisit(db, runtime, settings, listQueue, visitId, 'labor', 'Labor');

  const arrive = arriveVisit(db, runtime, visitId, 'labor');
  assert.deepEqual(arrive, { fromStatus: 'called', toStatus: 'in_room' });
});

test('arriveVisit from directed self_go succeeds with matching room scope', () => {
  const { db, visitId, runtime, listQueue } = setupVisitFlow();
  runtime.redirect(visitId, {
    queueId: null,
    targetLocationId: 'labor',
    movementMode: 'self_go',
    publicDisplayMode: 'visible',
    actorSurfaceId: 'pf_mfa_dashboard',
  });

  const arrive = arriveVisit(db, runtime, visitId, 'labor');
  assert.deepEqual(arrive, { fromStatus: 'directed', toStatus: 'in_room' });

  const row = listQueue()[0];
  assert.equal(row?.status, 'in_room');
  assert.equal(row?.roomId, 'labor');
});

test('arriveVisit from directed rejects wrong room with QUEUE_ROOM_MISMATCH', () => {
  const { db, visitId, runtime } = setupVisitFlow();
  runtime.redirect(visitId, {
    queueId: null,
    targetLocationId: 'labor',
    movementMode: 'self_go',
    publicDisplayMode: 'visible',
    actorSurfaceId: 'pf_mfa_dashboard',
  });

  assert.throws(
    () => arriveVisit(db, runtime, visitId, 'mfa-tresen'),
    (error: unknown) => error instanceof DomainError && error.domainCode === QUEUE_ROOM_MISMATCH,
  );
});

test('arriveVisit accepts waiting pickup via core transition rules', () => {
  const { db, visitId, runtime } = setupVisitFlow();
  runtime.redirect(visitId, {
    queueId: null,
    targetLocationId: 'labor',
    movementMode: 'pickup',
    publicDisplayMode: 'visible',
    actorSurfaceId: 'pf_mfa_dashboard',
  });

  const arrive = arriveVisit(db, runtime, visitId, 'labor');
  assert.deepEqual(arrive, { fromStatus: 'waiting', toStatus: 'in_room' });
});

test('reassignVisitRoom delegates tactical target change to flow-core', () => {
  const { db, visitId, runtime, settings, listQueue } = setupVisitFlow();
  callVisit(db, runtime, settings, listQueue, visitId, 'labor', 'Labor');
  arriveVisit(db, runtime, visitId, 'labor');

  const result = reassignVisitRoom(
    db,
    runtime,
    settings,
    listQueue,
    visitId,
    'mfa-tresen',
    'Empfang',
  );

  assert.deepEqual(result, { fromStatus: 'in_room', toStatus: 'called' });
  const after = runtime.visits().find((visit) => visit.id === visitId);
  assert.equal(after?.targetLocationId, 'mfa-tresen');
  assert.ok(runtime.events(visitId).some((event) => event.type === 'target_reassigned'));
  assert.ok(!runtime.events(visitId).some((event) => event.type === 'redirected'));
});

test('cancelVisit marks waiting ticket cancelled and removes it from queue', () => {
  const { db, visitId, runtime, listQueue } = setupVisitFlow();
  assert.equal(listQueue().length, 1);

  const cancelled = cancelVisit(db, runtime, visitId);
  assert.deepEqual(cancelled, { fromStatus: 'waiting', toStatus: 'cancelled' });
  assert.equal(listQueue().length, 0);

  const visit = db.prepare('SELECT status FROM visits WHERE id = ?').get(visitId) as
    | { status?: string }
    | undefined;
  assert.equal(visit?.status, 'cancelled');
});

test('cancelVisit clears directed self_go ticket', () => {
  const { db, visitId, runtime, listQueue } = setupVisitFlow();
  runtime.redirect(visitId, {
    queueId: null,
    targetLocationId: 'labor',
    movementMode: 'self_go',
    publicDisplayMode: 'visible',
    actorSurfaceId: 'pf_mfa_dashboard',
  });
  assert.equal(listQueue()[0]?.status, 'directed');

  const cancelled = cancelVisit(db, runtime, visitId);
  assert.deepEqual(cancelled, { fromStatus: 'directed', toStatus: 'cancelled' });
  assert.equal(listQueue().length, 0);
});

test('scoped arrive rejects wrong room with QUEUE_ROOM_MISMATCH', () => {
  const { db, visitId, runtime, settings, listQueue } = setupVisitFlow();
  callVisit(db, runtime, settings, listQueue, visitId, 'labor', 'Labor');

  assert.throws(
    () => arriveVisit(db, runtime, visitId, 'mfa-tresen'),
    (error: unknown) => error instanceof DomainError && error.domainCode === QUEUE_ROOM_MISMATCH,
  );
});

test('scoped done rejects wrong room with QUEUE_ROOM_MISMATCH', () => {
  const { db, visitId, runtime, settings, listQueue } = setupVisitFlow();
  callVisit(db, runtime, settings, listQueue, visitId, 'labor', 'Labor');
  arriveVisit(db, runtime, visitId, 'labor');

  assert.throws(
    () => completeVisit(runtime, visitId, 'mfa-tresen'),
    (error: unknown) => error instanceof DomainError && error.domainCode === QUEUE_ROOM_MISMATCH,
  );
});

test('scoped done succeeds when acting room matches target', () => {
  const { db, visitId, runtime, settings, listQueue } = setupVisitFlow();
  callVisit(db, runtime, settings, listQueue, visitId, 'labor', 'Labor');
  arriveVisit(db, runtime, visitId, 'labor');

  const done = completeVisit(runtime, visitId, 'labor');
  assert.deepEqual(done, { fromStatus: 'in_room', toStatus: 'done' });
});

test('returnVisitToWaiting: call → waiting keeps target room', () => {
  const { db, visitId, runtime, settings, listQueue } = setupVisitFlow();
  callVisit(db, runtime, settings, listQueue, visitId, 'labor', 'Labor');

  const result = returnVisitToWaiting(runtime, visitId);
  assert.deepEqual(result, { fromStatus: 'called', toStatus: 'waiting' });

  const visit = runtime.visits().find((entry) => entry.id === visitId);
  assert.equal(visit?.status, 'waiting');
  assert.equal(visit?.targetLocationId, 'labor');
  assert.equal(visit?.calledAt, undefined);

  const row = visitToQueueVisitRow(visit!, settings);
  assert.equal(row.destinationRoomId, 'labor');
});

test('returnVisitToWaiting: call → arrive → waiting keeps target room', () => {
  const { db, visitId, runtime, settings, listQueue } = setupVisitFlow();
  callVisit(db, runtime, settings, listQueue, visitId, 'labor', 'Labor');
  arriveVisit(db, runtime, visitId, 'labor');

  const result = returnVisitToWaiting(runtime, visitId);
  assert.deepEqual(result, { fromStatus: 'in_room', toStatus: 'waiting' });

  const visit = runtime.visits().find((entry) => entry.id === visitId);
  assert.equal(visit?.status, 'waiting');
  assert.equal(visit?.targetLocationId, 'labor');
  assert.equal(visitToQueueVisitRow(visit!, settings).destinationRoomId, 'labor');
});

test('returnVisitToWaiting: start (in_progress) → waiting keeps target room', () => {
  const { db, visitId, runtime, settings, listQueue } = setupVisitFlow();
  callVisit(db, runtime, settings, listQueue, visitId, 'labor', 'Labor');
  arriveVisit(db, runtime, visitId, 'labor');
  startVisit(runtime, visitId, 'labor');

  const result = returnVisitToWaiting(runtime, visitId);
  assert.deepEqual(result, { fromStatus: 'in_room', toStatus: 'waiting' });

  const visit = runtime.visits().find((entry) => entry.id === visitId);
  assert.equal(visit?.status, 'waiting');
  assert.equal(visit?.targetLocationId, 'labor');
  assert.equal(visit?.startedAt, undefined);
  assert.equal(visitToQueueVisitRow(visit!, settings).destinationRoomId, 'labor');
});

test('returnVisitToWaiting: recall emits no journey_abandoned event', () => {
  const { db, visitId, runtime, settings, listQueue } = setupVisitFlow();
  callVisit(db, runtime, settings, listQueue, visitId, 'labor', 'Labor');

  returnVisitToWaiting(runtime, visitId);

  assert.ok(
    !runtime.events(visitId).some((event) => event.type === 'journey_abandoned'),
    'recall must not abandon journey',
  );
});

test('setVisitAbsent overlays absent_wait_here on waiting visit', () => {
  const { db, visitId, runtime, settings, listQueue } = setupVisitFlow();

  const transition = setVisitAbsent(
    db,
    runtime,
    settings,
    visitId,
    'wait_here',
    '2026-07-04T12:05:00.000Z',
  );
  assert.deepEqual(transition, { fromStatus: 'waiting', toStatus: 'absent_wait_here' });

  const row = listQueue()[0];
  assert.equal(row?.status, 'absent_wait_here');
  assert.equal(runtime.visits().find((v) => v.id === visitId)?.status, 'waiting');
});

test('callVisit rejects waiting visit with absent host overlay', () => {
  const { db, visitId, runtime, settings, listQueue } = setupVisitFlow();
  setVisitAbsent(db, runtime, settings, visitId, 'wait_here', '2026-07-04T12:05:00.000Z');

  assert.throws(
    () => callVisit(db, runtime, settings, listQueue, visitId, 'labor', 'Labor'),
    (error: unknown) => error instanceof DomainError && error.domainCode === 'INVALID_TRANSITION',
  );
});

test('arriveVisit rejects called visit with absent host overlay', () => {
  const { db, visitId, runtime, settings, listQueue } = setupVisitFlow();
  callVisit(db, runtime, settings, listQueue, visitId, 'labor', 'Labor');
  setVisitAbsent(db, runtime, settings, visitId, 'wait_here', '2026-07-04T12:05:00.000Z');

  assert.throws(
    () => arriveVisit(db, runtime, visitId, 'labor'),
    (error: unknown) => error instanceof DomainError && error.domainCode === 'INVALID_TRANSITION',
  );
});

test('recallVisit sets return_later with notify phone from checkinPhone', () => {
  const { db, visitId, runtime, settings, listQueue } = setupVisitFlow();
  upsertVisitHostState(db, visitId, { checkinPhone: '+49172111111' }, '2026-07-04T12:00:00.000Z');
  setVisitAbsentMode(db, visitId, 'wait_here', '2026-07-04T12:01:00.000Z');

  const recall = recallVisit(db, runtime, settings, visitId, 15, '2026-07-04T12:02:00.000Z');

  assert.equal(recall.toStatus, 'absent_return_later');
  assert.equal(recall.callbackPhone, '+49172111111');
  assert.ok(recall.returnUntil);

  const row = listQueue()[0];
  assert.equal(row?.status, 'absent_return_later');
  assert.equal(row?.returnUntil, recall.returnUntil);
});

test('recallVisit rejects second recall while return window is active', () => {
  const { db, visitId, runtime, settings } = setupVisitFlow();
  setVisitAbsentMode(db, visitId, 'wait_here', '2026-07-04T12:01:00.000Z');
  recallVisit(db, runtime, settings, visitId, 15, '2026-07-04T12:02:00.000Z');

  assert.throws(
    () => recallVisit(db, runtime, settings, visitId, 15, '2026-07-04T12:03:00.000Z'),
    (error: unknown) => error instanceof DomainError && error.domainCode === 'INVALID_TRANSITION',
  );
});

test('recallVisit allows first recall from return_later overlay without returnUntil', () => {
  const { db, visitId, runtime, settings, listQueue } = setupVisitFlow();
  setVisitAbsent(db, runtime, settings, visitId, 'return_later', '2026-07-04T12:01:00.000Z');
  assert.equal(listQueue()[0]?.status, 'absent_return_later');
  assert.equal(listQueue()[0]?.returnUntil ?? null, null);

  const recall = recallVisit(db, runtime, settings, visitId, 15, '2026-07-04T12:02:00.000Z');
  assert.equal(recall.toStatus, 'absent_return_later');
  assert.ok(recall.returnUntil);
});

test('recallVisit rejects re-recall after set_absence(wait_here) while window still active', () => {
  const { db, visitId, runtime, settings } = setupVisitFlow();
  setVisitAbsentMode(db, visitId, 'wait_here', '2026-07-04T12:01:00.000Z');
  const first = recallVisit(db, runtime, settings, visitId, 15, '2026-07-04T12:02:00.000Z');
  assert.ok(first.returnUntil);

  // Overlay flipped back to wait_here without clearing returnUntil.
  setVisitAbsentMode(db, visitId, 'wait_here', '2026-07-04T12:03:00.000Z');

  assert.throws(
    () => recallVisit(db, runtime, settings, visitId, 15, '2026-07-04T12:04:00.000Z'),
    (error: unknown) => error instanceof DomainError && error.domainCode === 'INVALID_TRANSITION',
  );
});

test('setVisitCallbackPhone stores canonical phone in host state', () => {
  const { db, visitId, runtime, settings } = setupVisitFlow();

  const result = setVisitCallbackPhone(
    db,
    runtime,
    settings,
    visitId,
    ' 0172111111 ',
    '2026-07-04T12:03:00.000Z',
  );
  assert.equal(result.callbackPhone, '+49172111111');
});

test('cycleVisitTriageLevel cycles triage in host state', () => {
  const { db, visitId, runtime, settings, listQueue } = setupVisitFlow();

  const first = cycleVisitTriageLevel(db, runtime, settings, visitId, '2026-07-04T12:04:00.000Z');
  assert.equal(first.triageLevel, 'green');
  assert.equal(listQueue()[0]?.triageLevel, 'green');
});

test('returnAbsentVisitToQueue clears absent overlay without core transition', () => {
  const { db, visitId, runtime, settings, listQueue } = setupVisitFlow();
  setVisitAbsent(db, runtime, settings, visitId, 'return_later', '2026-07-04T12:05:00.000Z');

  const result = returnAbsentVisitToQueue(db, runtime, visitId, '2026-07-04T12:06:00.000Z');
  assert.deepEqual(result, { fromStatus: 'absent_return_later', toStatus: 'waiting' });
  assert.equal(listQueue()[0]?.status, 'waiting');
});
