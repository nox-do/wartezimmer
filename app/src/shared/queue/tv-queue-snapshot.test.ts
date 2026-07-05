import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_TERMINAL_TOPIC_DEFINITIONS } from '../checkin-topic-settings.js';
import { getBusinessDay } from '../db/database-time.js';
import type { OpsSettings } from '../db/db-types.js';
import { createVisitCheckInInDb } from '../flow-core/flow-core-checkin.js';
import { syncFlowCoreCatalog, getFlowCoreRuntime } from '../flow-core/flow-core-runtime.js';
import { ensureFlowCoreSchema } from '../flow-core/flow-core-schema.js';
import {
  arriveVisit,
  callVisit,
  listVisitQueueRows,
  returnVisitToWaiting,
} from '../flow-core/visit-queue-bridge.js';
import { buildTvQueueSnapshotForSqlite } from './tv-queue-snapshot.js';
import type { CheckinSessionDeps } from '../db/database-checkin-sessions.js';
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
    checkinLockStmt,
    dayCloseStateStmt,
    updateCheckinLockStmt: db.prepare('SELECT 1'),
    getVisitIdentityViewStmt: db.prepare('SELECT 1'),
    getVisitPortalContextStmt: db.prepare('SELECT 1'),
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
} {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  ensureFlowCoreSchema(db);
  const settings = sampleSettings();
  syncFlowCoreCatalog(db, settings);
  const created = createVisitCheckInInDb(buildDeps(db, settings), {
    topicId: 'blut',
    authPath: 'phone_dob',
    identityRef: 'TV Snapshot Test',
  });
  const runtime = getFlowCoreRuntime(db);
  return { db, settings, visitId: created.visitId, runtime };
}

test('buildTvQueueSnapshotFromFlowCore shows waiting visit when explainVisibility allows', () => {
  const { db, settings } = setupVisitFlow();

  const snapshot = buildTvQueueSnapshotForSqlite(db, settings, false, 1);

  assert.equal(snapshot.view, 'tv');
  assert.equal(snapshot.items.length, 1);
  assert.equal(snapshot.items[0]?.laneCode, 'L');
  assert.equal(snapshot.items[0]?.status, 'waiting');
  assert.equal(snapshot.items[0]?.roomLabel, null);
});

test('buildTvQueueSnapshotFromFlowCore includes called visit with room label', () => {
  const { db, settings, visitId, runtime } = setupVisitFlow();
  const listQueue = () => listVisitQueueRows(runtime, settings, getBusinessDay());
  callVisit(db, runtime, settings, listQueue, visitId, 'labor', 'Labor');

  const snapshot = buildTvQueueSnapshotForSqlite(db, settings, false, 2);

  assert.equal(snapshot.items.length, 1);
  assert.equal(snapshot.items[0]?.status, 'called');
  assert.equal(snapshot.items[0]?.roomLabel, 'Labor');
});

test('buildTvQueueSnapshotFromFlowCore hides visit after arrive (not at Wartezimmer surface)', () => {
  const { db, settings, visitId, runtime } = setupVisitFlow();
  const listQueue = () => listVisitQueueRows(runtime, settings, getBusinessDay());
  callVisit(db, runtime, settings, listQueue, visitId, 'labor', 'Labor');
  arriveVisit(db, runtime, visitId, 'labor');

  const snapshot = buildTvQueueSnapshotForSqlite(db, settings, false, 3);

  assert.equal(snapshot.items.length, 0);
});

test('buildTvQueueSnapshotFromFlowCore shows visit again after return_to_waiting', () => {
  const { db, settings, visitId, runtime } = setupVisitFlow();
  const listQueue = () => listVisitQueueRows(runtime, settings, getBusinessDay());
  callVisit(db, runtime, settings, listQueue, visitId, 'labor', 'Labor');
  arriveVisit(db, runtime, visitId, 'labor');

  const hidden = buildTvQueueSnapshotForSqlite(db, settings, false, 3);
  assert.equal(hidden.items.length, 0);

  returnVisitToWaiting(runtime, visitId);

  const visibleAgain = buildTvQueueSnapshotForSqlite(db, settings, false, 4);
  assert.equal(visibleAgain.items.length, 1);
  assert.equal(visibleAgain.items[0]?.status, 'waiting');
  assert.equal(visibleAgain.items[0]?.roomLabel, null);
});
