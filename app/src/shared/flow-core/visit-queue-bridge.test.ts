import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_TERMINAL_TOPIC_DEFINITIONS } from '../checkin-topic-settings.js';
import { DomainError } from '../errors/domain-error.js';
import { QUEUE_ROOM_MISMATCH } from '../queue/queue-room-scope.js';
import { ensureFlowCoreSchema } from './flow-core-schema.js';
import { syncFlowCoreCatalog, getFlowCoreRuntime } from './flow-core-runtime.js';
import { createVisitCheckInInDb } from './flow-core-checkin.js';
import {
  arriveVisitTicket,
  callVisitTicket,
  doneVisitTicket,
  listVisitQueueRows,
  returnToWaitingVisitTicket,
  startVisitTicket,
  visitStatusToTicketStatus,
} from './visit-queue-bridge.js';
import { getBusinessDay } from '../db/database-time.js';
import type { CheckinSessionDeps } from '../db/database-checkin-sessions.js';
import type { OpsSettings } from '../db/db-types.js';
import { normalizeDayClosePhase } from '../db/database-time.js';

function sampleSettings(): OpsSettings {
  return {
    returnWindowMinutes: 15,
    practiceOpenFrom: '00:00',
    practiceOpenTo: '23:59',
    practiceProfileJson: '{}',
    topics: DEFAULT_TERMINAL_TOPIC_DEFINITIONS,
    rooms: [
      {
        roomId: 'mfa-tresen',
        roomLabel: 'Empfang',
        enabled: true,
        defaultCallTarget: true,
        maxOccupancy: null,
      },
      {
        roomId: 'labor',
        roomLabel: 'Labor',
        enabled: true,
        defaultCallTarget: false,
        maxOccupancy: null,
        panel: {
          enabled: true,
          placement: 'outside',
          mode: 'arrival',
          showPatientNames: false,
          calledTextPreset: 'please_enter',
          calledTextCustom: null,
          arrivedTextPreset: 'please_wait_here',
          arrivedTextCustom: null,
        },
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

function buildDeps(db: DatabaseSync, settings: OpsSettings): CheckinSessionDeps & { db: DatabaseSync } {
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
    getNextTicketNumberStmt: db.prepare('SELECT 1'),
    insertTicketStmt: db.prepare('SELECT 1'),
    insertQueueEntryStmt: db.prepare('SELECT 1'),
    checkinLockStmt,
    dayCloseStateStmt,
    updateCheckinLockStmt: db.prepare('SELECT 1'),
    getTicketIdentityViewStmt: db.prepare('SELECT 1'),
    getTicketPortalContextStmt: db.prepare('SELECT 1'),
    insertPatientSessionStmt: db.prepare('SELECT 1'),
    expireActiveSessionsByTicketStmt: db.prepare('SELECT 1'),
    getActiveSessionByTicketStmt: db.prepare('SELECT 1'),
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
  const listQueue = () => listVisitQueueRows(runtime, settings, getBusinessDay());
  return { db, settings, visitId: created.ticketId, runtime, listQueue };
}

test('visitStatusToTicketStatus maps arrived and in_progress to in_room', () => {
  assert.equal(visitStatusToTicketStatus('arrived'), 'in_room');
  assert.equal(visitStatusToTicketStatus('in_progress'), 'in_room');
  assert.equal(visitStatusToTicketStatus('done'), 'done');
});

test('visit flow call → arrive → done end-to-end', () => {
  const { settings, visitId, runtime, listQueue } = setupVisitFlow();

  const call = callVisitTicket(runtime, settings, listQueue, visitId, 'labor', 'Labor');
  assert.deepEqual(call, { fromStatus: 'waiting', toStatus: 'called' });

  let rows = listQueue();
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.status, 'called');
  assert.equal(rows[0]?.roomId, 'labor');

  const arrive = arriveVisitTicket(runtime, visitId);
  assert.deepEqual(arrive, { fromStatus: 'called', toStatus: 'in_room' });

  rows = listQueue();
  assert.equal(rows[0]?.status, 'in_room');
  assert.equal(rows[0]?.roomId, 'labor');

  const done = doneVisitTicket(runtime, visitId);
  assert.deepEqual(done, { fromStatus: 'in_room', toStatus: 'done' });

  rows = listQueue();
  assert.equal(rows.length, 0);
});

test('MFA done from arrived auto-starts before completing', () => {
  const { visitId, runtime, settings, listQueue, db } = setupVisitFlow();
  callVisitTicket(runtime, settings, listQueue, visitId, 'labor', 'Labor');
  arriveVisitTicket(runtime, visitId);

  const done = doneVisitTicket(runtime, visitId);
  assert.deepEqual(done, { fromStatus: 'in_room', toStatus: 'done' });

  const visit = db
    .prepare('SELECT status, started_at AS startedAt FROM visits WHERE id = ?')
    .get(visitId) as { status?: string; startedAt?: string | null } | undefined;
  assert.equal(visit?.status, 'done');
  assert.ok(visit?.startedAt);
});

test('scoped arrive succeeds when acting room matches target', () => {
  const { visitId, runtime, settings, listQueue } = setupVisitFlow();
  callVisitTicket(runtime, settings, listQueue, visitId, 'labor', 'Labor');

  const arrive = arriveVisitTicket(runtime, visitId, 'labor');
  assert.deepEqual(arrive, { fromStatus: 'called', toStatus: 'in_room' });
});

test('scoped arrive rejects wrong room with QUEUE_ROOM_MISMATCH', () => {
  const { visitId, runtime, settings, listQueue } = setupVisitFlow();
  callVisitTicket(runtime, settings, listQueue, visitId, 'labor', 'Labor');

  assert.throws(
    () => arriveVisitTicket(runtime, visitId, 'mfa-tresen'),
    (error: unknown) => error instanceof DomainError && error.domainCode === QUEUE_ROOM_MISMATCH,
  );
});

test('scoped done rejects wrong room with QUEUE_ROOM_MISMATCH', () => {
  const { visitId, runtime, settings, listQueue } = setupVisitFlow();
  callVisitTicket(runtime, settings, listQueue, visitId, 'labor', 'Labor');
  arriveVisitTicket(runtime, visitId, 'labor');

  assert.throws(
    () => doneVisitTicket(runtime, visitId, 'mfa-tresen'),
    (error: unknown) => error instanceof DomainError && error.domainCode === QUEUE_ROOM_MISMATCH,
  );
});

test('scoped done succeeds when acting room matches target', () => {
  const { visitId, runtime, settings, listQueue } = setupVisitFlow();
  callVisitTicket(runtime, settings, listQueue, visitId, 'labor', 'Labor');
  arriveVisitTicket(runtime, visitId, 'labor');

  const done = doneVisitTicket(runtime, visitId, 'labor');
  assert.deepEqual(done, { fromStatus: 'in_room', toStatus: 'done' });
});

test('returnToWaitingVisitTicket: call → waiting clears room', () => {
  const { visitId, runtime, settings, listQueue } = setupVisitFlow();
  callVisitTicket(runtime, settings, listQueue, visitId, 'labor', 'Labor');

  const result = returnToWaitingVisitTicket(runtime, visitId);
  assert.deepEqual(result, { fromStatus: 'called', toStatus: 'waiting' });

  const visit = runtime.visits().find((entry) => entry.id === visitId);
  assert.equal(visit?.status, 'waiting');
  assert.equal(visit?.targetLocationId, undefined);
  assert.equal(visit?.calledAt, undefined);
});

test('returnToWaitingVisitTicket: call → arrive → waiting', () => {
  const { visitId, runtime, settings, listQueue } = setupVisitFlow();
  callVisitTicket(runtime, settings, listQueue, visitId, 'labor', 'Labor');
  arriveVisitTicket(runtime, visitId, 'labor');

  const result = returnToWaitingVisitTicket(runtime, visitId);
  assert.deepEqual(result, { fromStatus: 'in_room', toStatus: 'waiting' });

  const visit = runtime.visits().find((entry) => entry.id === visitId);
  assert.equal(visit?.status, 'waiting');
  assert.equal(visit?.targetLocationId, undefined);
});

test('returnToWaitingVisitTicket: start (in_progress) → waiting', () => {
  const { visitId, runtime, settings, listQueue } = setupVisitFlow();
  callVisitTicket(runtime, settings, listQueue, visitId, 'labor', 'Labor');
  arriveVisitTicket(runtime, visitId, 'labor');
  startVisitTicket(runtime, visitId, 'labor');

  const result = returnToWaitingVisitTicket(runtime, visitId);
  assert.deepEqual(result, { fromStatus: 'in_room', toStatus: 'waiting' });

  const visit = runtime.visits().find((entry) => entry.id === visitId);
  assert.equal(visit?.status, 'waiting');
  assert.equal(visit?.targetLocationId, undefined);
  assert.equal(visit?.startedAt, undefined);
});

test('returnToWaitingVisitTicket: recall emits no journey_abandoned event', () => {
  const { visitId, runtime, settings, listQueue } = setupVisitFlow();
  callVisitTicket(runtime, settings, listQueue, visitId, 'labor', 'Labor');

  returnToWaitingVisitTicket(runtime, visitId);

  assert.ok(
    !runtime.events(visitId).some((event) => event.type === 'journey_abandoned'),
    'recall must not abandon journey',
  );
});
