import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_TERMINAL_TOPIC_DEFINITIONS } from '../checkin-topic-settings.js';
import { ensureFlowCoreSchema } from './flow-core-schema.js';
import { syncFlowCoreCatalog } from './flow-core-runtime.js';
import { createVisitCheckInInDb } from './flow-core-checkin.js';
import { listVisitQueueRows } from './visit-queue-bridge.js';
import { getBusinessDay } from '../db/database-time.js';
import { getFlowCoreRuntime } from './flow-core-runtime.js';
import type { CheckinSessionDeps } from '../db/database-checkin-sessions.js';
import type { OpsSettings } from '../db/db-types.js';
import { normalizeDayClosePhase } from '../db/database-time.js';
import { MFA_ASSIST_TOPIC_ID } from '../checkin-topic-settings.js';

function sampleSettings(): OpsSettings {
  return {
    routingMode: 'simple',
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
  const events: Array<{ type: string; aggregateId: string; payload: Record<string, unknown> }> = [];

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
    touchPatientSessionStmt: db.prepare('SELECT 1'),
    expirePatientSessionStmt: db.prepare('SELECT 1'),
    revokePatientSessionStmt: db.prepare('SELECT 1'),
    nowIso: () => '2026-07-04T12:00:00.000Z',
    getBusinessDay,
    getBusinessTimeZone: () => 'Europe/Berlin',
    getOpsSettings: () => settings,
    normalizeDayClosePhase,
    emitOutboxEvent: (eventType, aggregateId, payload) => {
      events.push({ type: eventType, aggregateId, payload });
    },
  };
}

test('createVisitCheckInInDb writes a visit and exposes it in the queue list', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  ensureFlowCoreSchema(db);
  const settings = sampleSettings();
  syncFlowCoreCatalog(db, settings);

  const created = createVisitCheckInInDb(buildDeps(db, settings), {
    topicId: 'blut',
    authPath: 'phone_dob',
    identityRef: 'Integration Test',
  });

  assert.match(created.visitId, /^\d{8}-L-\d{3}$/);
  assert.ok(created.number >= 1);
  assert.equal(created.destinationRoomLabel, 'Empfang');

  const queueRows = listVisitQueueRows(getFlowCoreRuntime(db), settings, getBusinessDay());
  assert.equal(queueRows.length, 1);
  assert.equal(queueRows[0]?.id, created.visitId);
  assert.equal(queueRows[0]?.status, 'waiting');
  assert.equal(queueRows[0]?.topicId, 'blut');
});

test('syncFlowCoreCatalog seeds reserved mfa topic and direct mfa check-in works', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  ensureFlowCoreSchema(db);
  const settings = sampleSettings();
  syncFlowCoreCatalog(db, settings);

  const catalog = getFlowCoreRuntime(db).catalog();
  assert.equal(
    catalog.topics.some((topic) => topic.id === MFA_ASSIST_TOPIC_ID),
    true,
  );
  assert.equal(
    catalog.routingRules.some((rule) => rule.topicId === MFA_ASSIST_TOPIC_ID),
    true,
  );

  const created = createVisitCheckInInDb(buildDeps(db, settings), {
    topicId: MFA_ASSIST_TOPIC_ID,
    authPath: 'none',
    identityRef: 'Empfang',
  });

  assert.match(created.visitId, /^\d{8}-M-\d{3}$/);

  const queueRows = listVisitQueueRows(getFlowCoreRuntime(db), settings, getBusinessDay());
  assert.equal(queueRows.length, 1);
  assert.equal(queueRows[0]?.id, created.visitId);
  assert.equal(queueRows[0]?.topicId, MFA_ASSIST_TOPIC_ID);
});
