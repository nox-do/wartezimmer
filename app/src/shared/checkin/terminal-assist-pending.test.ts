import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_TERMINAL_TOPIC_DEFINITIONS } from '../checkin-topic-settings.js';
import { ensureFlowCoreSchema } from '../flow-core/flow-core-schema.js';
import { syncFlowCoreCatalog } from '../flow-core/flow-core-runtime.js';
import {
  clearTerminalAssistPending,
  ensureTerminalAssistPendingSchema,
  expireTerminalAssistPending,
  isTerminalAssistPendingActive,
  listActiveTerminalAssistPending,
  TERMINAL_ASSIST_PENDING_TIMEOUT_MS,
  upsertTerminalAssistPending,
} from './terminal-assist-pending.js';
import {
  clearAllTerminalAssistPendingExpiries,
  resetTerminalAssistPendingExpirySchedulerForTests,
} from './terminal-assist-pending-expiry-scheduler.js';
import { buildMfaQueueSnapshot } from '../queue/mfa-queue-snapshot.js';
import { getBusinessDay } from '../db/database-time.js';
import type { OpsSettings } from '../db/db-types.js';
import { createVisitCheckInInDb } from '../flow-core/flow-core-checkin.js';
import type { CheckinSessionDeps } from '../db/database-checkin-sessions.js';
import { normalizeDayClosePhase } from '../db/database-time.js';
import { getFlowCoreRuntime } from '../flow-core/flow-core-runtime.js';
import { listVisitQueueRows } from '../flow-core/visit-queue-bridge.js';
import { TERMINAL_DEVICE_ID } from '../ops/device-ids.js';

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
    checkinLockStmt,
    dayCloseStateStmt,
    updateCheckinLockStmt: db.prepare('SELECT 1'),
    getTicketIdentityViewStmt: db.prepare('SELECT 1'),
    getTicketPortalContextStmt: db.prepare('SELECT 1'),
    insertPatientSessionStmt: db.prepare('SELECT 1'),
    expireActiveSessionsByTicketStmt: db.prepare('SELECT 1'),
    getActiveSessionByTicketStmt: db.prepare('SELECT 1'),
    getPatientSessionByTokenStmt: db.prepare('SELECT 1'),
    updatePatientSessionStatusStmt: db.prepare('SELECT 1'),
    getOpsSettings: () => settings,
    getBusinessDay,
    getBusinessTimeZone: () => 'Europe/Berlin',
    normalizeDayClosePhase,
    emitOutboxEvent: () => {},
    nowIso: () => '2026-07-04T12:00:00.000Z',
  };
}

function stubDb(db: DatabaseSync, settings: OpsSettings) {
  const runtime = getFlowCoreRuntime(db);
  return {
    getOpsSettings: () => settings,
    isEffectiveCheckinLocked: () => false,
    listQueue: () => listVisitQueueRows(runtime, settings, getBusinessDay()),
    listActiveTerminalAssistPending: (nowMs = Date.now()) => listActiveTerminalAssistPending(db, nowMs),
    expireTerminalAssistPending: (deviceId: string, nowMs = Date.now()) => {
      const rows = listActiveTerminalAssistPending(db, nowMs);
      const row = rows.find((entry) => entry.deviceId === deviceId);
      if (!row) {
        const allRows = db
          .prepare(
            'SELECT device_id AS deviceId, expires_at AS expiresAt FROM terminal_assist_pending WHERE device_id = ?',
          )
          .get(deviceId) as { expiresAt?: string } | undefined;
        if (!allRows?.expiresAt || Date.parse(allRows.expiresAt) > nowMs) {
          return false;
        }
        return clearTerminalAssistPending(db, deviceId);
      }
      if (Date.parse(row.expiresAt) > nowMs) {
        return false;
      }
      return clearTerminalAssistPending(db, deviceId);
    },
  };
}

test('terminal assist pending: press creates no visit', () => {
  const db = new DatabaseSync(':memory:');
  ensureFlowCoreSchema(db);
  ensureTerminalAssistPendingSchema(db);
  syncFlowCoreCatalog(db, sampleSettings());

  upsertTerminalAssistPending(db, TERMINAL_DEVICE_ID);
  assert.equal(getFlowCoreRuntime(db).visits().length, 0);
  assert.equal(listActiveTerminalAssistPending(db).length, 1);
});

test('terminal assist pending: check-in with active press sets needsAssistance', () => {
  const db = new DatabaseSync(':memory:');
  ensureFlowCoreSchema(db);
  ensureTerminalAssistPendingSchema(db);
  const settings = sampleSettings();
  syncFlowCoreCatalog(db, settings);
  upsertTerminalAssistPending(db, TERMINAL_DEVICE_ID);

  const created = createVisitCheckInInDb(buildDeps(db, settings), {
    topicId: 'blut',
    authPath: 'phone_dob',
    needsAssistance: true,
  });
  clearTerminalAssistPending(db, TERMINAL_DEVICE_ID);

  const visit = getFlowCoreRuntime(db).visits().find((entry) => entry.id === created.visitId);
  assert.equal(visit?.needsAssistance, true);
  assert.equal(visit?.primaryTopicId, 'blut');
  assert.equal(isTerminalAssistPendingActive(db, TERMINAL_DEVICE_ID), false);
});

test('terminal assist pending: expiry clears pending without visit', () => {
  resetTerminalAssistPendingExpirySchedulerForTests();
  const db = new DatabaseSync(':memory:');
  ensureTerminalAssistPendingSchema(db);
  const now = new Date('2026-07-04T12:00:00.000Z');
  const row = upsertTerminalAssistPending(db, TERMINAL_DEVICE_ID, now, 10_000);
  const expiresMs = Date.parse(row.expiresAt);

  assert.equal(isTerminalAssistPendingActive(db, TERMINAL_DEVICE_ID, expiresMs - 1), true);
  assert.equal(expireTerminalAssistPending(db, TERMINAL_DEVICE_ID, expiresMs), true);
  assert.equal(listActiveTerminalAssistPending(db, expiresMs).length, 0);
  clearAllTerminalAssistPendingExpiries();
});

test('mfa queue snapshot includes assistPending and needsAssistance', () => {
  const db = new DatabaseSync(':memory:');
  ensureFlowCoreSchema(db);
  ensureTerminalAssistPendingSchema(db);
  const settings = sampleSettings();
  syncFlowCoreCatalog(db, settings);
  upsertTerminalAssistPending(db, TERMINAL_DEVICE_ID);

  createVisitCheckInInDb(buildDeps(db, settings), {
    topicId: 'blut',
    authPath: 'phone_dob',
    needsAssistance: true,
  });

  const snapshot = buildMfaQueueSnapshot(stubDb(db, settings) as never, 1);
  assert.equal(snapshot.assistPending.length, 1);
  assert.equal(snapshot.items.length, 1);
  assert.equal(snapshot.items[0]?.needsAssistance, true);
});

test('TERMINAL_ASSIST_PENDING_TIMEOUT_MS is 10 seconds', () => {
  assert.equal(TERMINAL_ASSIST_PENDING_TIMEOUT_MS, 10_000);
});
