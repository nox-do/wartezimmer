import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import type { CoreDatabase } from '../db/database.js';
import { DEFAULT_TERMINAL_TOPIC_DEFINITIONS } from '../checkin-topic-settings.js';
import type { CheckinSessionDeps } from '../db/database-checkin-sessions.js';
import { getBusinessDay, normalizeDayClosePhase } from '../db/database-time.js';
import type { OpsSettings } from '../db/db-types.js';
import { createVisitCheckInInDb } from '../flow-core/flow-core-checkin.js';
import { syncFlowCoreCatalog, getFlowCoreRuntime } from '../flow-core/flow-core-runtime.js';
import { ensureFlowCoreSchema } from '../flow-core/flow-core-schema.js';
import {
  arriveVisitTicket,
  callVisitTicket,
  doneVisitTicket,
  listVisitQueueRows,
  returnToWaitingVisitTicket,
} from '../flow-core/visit-queue-bridge.js';
import {
  buildRoomPanelQueueSnapshotForSqlite,
  compareRoomPanelCallOrder,
} from './room-panel-queue-snapshot.js';

test('compareRoomPanelCallOrder falls back to createdAt when calledAt is missing', () => {
  assert.ok(
    compareRoomPanelCallOrder(
      { calledAt: null, createdAt: '2026-06-18T08:00:00.000Z' },
      { calledAt: null, createdAt: '2026-06-18T09:00:00.000Z' },
    ) < 0,
  );
});

function panelTestSettings(showPatientNames = false): OpsSettings {
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
          showPatientNames,
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

function setupPanelVisitFlow(showPatientNames = false): {
  sqlite: DatabaseSync;
  db: CoreDatabase;
  settings: OpsSettings;
  visitId: string;
  runtime: ReturnType<typeof getFlowCoreRuntime>;
  listQueue: () => ReturnType<typeof listVisitQueueRows>;
  deps: CheckinSessionDeps & { db: DatabaseSync };
} {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  ensureFlowCoreSchema(sqlite);
  const settings = panelTestSettings(showPatientNames);
  syncFlowCoreCatalog(sqlite, settings);

  sqlite.exec(`
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

  const deps: CheckinSessionDeps & { db: DatabaseSync } = {
    db: sqlite,
    findTicketByCodeStmt: sqlite.prepare('SELECT 1'),
    checkinLockStmt: sqlite.prepare('SELECT checkin_locked AS locked FROM ops_state WHERE id = 1'),
    dayCloseStateStmt: sqlite.prepare(
      'SELECT checkin_locked AS locked, day_close_phase AS phase, last_reset_business_day AS lastResetBusinessDay FROM ops_state WHERE id = 1',
    ),
    updateCheckinLockStmt: sqlite.prepare('SELECT 1'),
    getVisitIdentityViewStmt: sqlite.prepare('SELECT 1'),
    getVisitPortalContextStmt: sqlite.prepare('SELECT 1'),
    insertPatientSessionStmt: sqlite.prepare('SELECT 1'),
    expireActiveSessionsByTicketStmt: sqlite.prepare('SELECT 1'),
    getActiveSessionByTicketStmt: sqlite.prepare('SELECT 1'),
    getPatientSessionByTokenStmt: sqlite.prepare('SELECT 1'),
    touchPatientSessionStmt: sqlite.prepare('SELECT 1'),
    expirePatientSessionStmt: sqlite.prepare('SELECT 1'),
    revokePatientSessionStmt: sqlite.prepare('SELECT 1'),
    nowIso: () => '2026-07-04T12:00:00.000Z',
    getBusinessDay,
    getBusinessTimeZone: () => 'Europe/Berlin',
    getOpsSettings: () => settings,
    normalizeDayClosePhase,
    emitOutboxEvent: () => undefined,
  };

  const created = createVisitCheckInInDb(deps, {
    topicId: 'blut',
    authPath: 'phone_dob',
    identityRef: 'Panel Test',
  });

  const runtime = getFlowCoreRuntime(sqlite);
  const listQueue = () => listVisitQueueRows(runtime, settings, getBusinessDay());
  const db = {
    getOpsSettings: () => settings,
    getFlowCoreRuntimeInstance: () => runtime,
  } as unknown as CoreDatabase;

  return { sqlite, db, settings, visitId: created.visitId, runtime, listQueue, deps };
}

test('buildRoomPanelQueueSnapshot filters to session room and hides names by default', () => {
  const { db, sqlite, settings, visitId, runtime, listQueue, deps } = setupPanelVisitFlow();
  const otherVisit = createVisitCheckInInDb(deps, {
    topicId: 'blut',
    authPath: 'phone_dob',
    identityRef: 'Other Room',
  });
  callVisitTicket(sqlite, runtime, settings, listQueue, visitId, 'labor', 'Labor');
  callVisitTicket(sqlite, runtime, settings, listQueue, otherVisit.visitId, 'mfa-tresen', 'Empfang');

  const snapshot = buildRoomPanelQueueSnapshotForSqlite(db, sqlite, 7, {
    roomId: 'labor',
    placement: 'outside',
  });

  assert.equal(snapshot.view, 'room-panel');
  assert.equal(snapshot.revision, 7);
  assert.equal(snapshot.roomId, 'labor');
  assert.equal(snapshot.roomLabel, 'Labor');
  assert.equal(snapshot.items.length, 1);
  assert.equal(snapshot.items[0]?.visitId, visitId);
  assert.equal('identityRef' in snapshot.items[0]!, false);
});

test('buildRoomPanelQueueSnapshot includes identityRef only when room setting allows names', () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  ensureFlowCoreSchema(sqlite);
  const settings = panelTestSettings(true);
  settings.rooms.find((room) => room.roomId === 'labor')!.panel!.placement = 'inside';
  settings.rooms.find((room) => room.roomId === 'labor')!.panel!.mode = 'staff_full';
  syncFlowCoreCatalog(sqlite, settings);

  sqlite.exec(`
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

  const deps: CheckinSessionDeps & { db: DatabaseSync } = {
    db: sqlite,
    findTicketByCodeStmt: sqlite.prepare('SELECT 1'),
    checkinLockStmt: sqlite.prepare('SELECT checkin_locked AS locked FROM ops_state WHERE id = 1'),
    dayCloseStateStmt: sqlite.prepare(
      'SELECT checkin_locked AS locked, day_close_phase AS phase, last_reset_business_day AS lastResetBusinessDay FROM ops_state WHERE id = 1',
    ),
    updateCheckinLockStmt: sqlite.prepare('SELECT 1'),
    getVisitIdentityViewStmt: sqlite.prepare('SELECT 1'),
    getVisitPortalContextStmt: sqlite.prepare('SELECT 1'),
    insertPatientSessionStmt: sqlite.prepare('SELECT 1'),
    expireActiveSessionsByTicketStmt: sqlite.prepare('SELECT 1'),
    getActiveSessionByTicketStmt: sqlite.prepare('SELECT 1'),
    getPatientSessionByTokenStmt: sqlite.prepare('SELECT 1'),
    touchPatientSessionStmt: sqlite.prepare('SELECT 1'),
    expirePatientSessionStmt: sqlite.prepare('SELECT 1'),
    revokePatientSessionStmt: sqlite.prepare('SELECT 1'),
    nowIso: () => '2026-07-04T12:00:00.000Z',
    getBusinessDay,
    getBusinessTimeZone: () => 'Europe/Berlin',
    getOpsSettings: () => settings,
    normalizeDayClosePhase,
    emitOutboxEvent: () => undefined,
  };

  const created = createVisitCheckInInDb(deps, {
    topicId: 'blut',
    authPath: 'phone_dob',
    identityRef: 'Panel Test',
  });
  const runtime = getFlowCoreRuntime(sqlite);
  const listQueue = () => listVisitQueueRows(runtime, settings, getBusinessDay());
  const db = {
    getOpsSettings: () => settings,
    getFlowCoreRuntimeInstance: () => runtime,
  } as unknown as CoreDatabase;

  callVisitTicket(sqlite, runtime, settings, listQueue, created.visitId, 'labor', 'Labor');

  const snapshot = buildRoomPanelQueueSnapshotForSqlite(db, sqlite, 8, {
    roomId: 'labor',
    placement: 'inside',
  });

  assert.equal(snapshot.items[0]?.identityRef, 'Panel Test');
});

test('buildRoomPanelQueueSnapshot shows called visit for panel room via explainVisibility', () => {
  const { db, sqlite, settings, visitId, runtime, listQueue } = setupPanelVisitFlow();
  callVisitTicket(sqlite, runtime, settings, listQueue, visitId, 'labor', 'Labor');

  const snapshot = buildRoomPanelQueueSnapshotForSqlite(db, sqlite, 10, {
    roomId: 'labor',
    placement: 'outside',
  });

  assert.equal(snapshot.items.length, 1);
  assert.equal(snapshot.items[0]?.status, 'called');
  assert.equal(snapshot.items[0]?.laneCode, 'L');
});

test('buildRoomPanelQueueSnapshot maps arrived visit to in_room for panel room', () => {
  const { db, sqlite, settings, visitId, runtime, listQueue } = setupPanelVisitFlow();
  callVisitTicket(sqlite, runtime, settings, listQueue, visitId, 'labor', 'Labor');
  arriveVisitTicket(sqlite, runtime, visitId, 'labor');

  const snapshot = buildRoomPanelQueueSnapshotForSqlite(db, sqlite, 11, {
    roomId: 'labor',
    placement: 'outside',
  });

  assert.equal(snapshot.items.length, 1);
  assert.equal(snapshot.items[0]?.status, 'in_room');
});

test('buildRoomPanelQueueSnapshot hides visit after done', () => {
  const { db, sqlite, settings, visitId, runtime, listQueue } = setupPanelVisitFlow();
  callVisitTicket(sqlite, runtime, settings, listQueue, visitId, 'labor', 'Labor');
  arriveVisitTicket(sqlite, runtime, visitId, 'labor');
  doneVisitTicket(runtime, visitId, 'labor');

  const snapshot = buildRoomPanelQueueSnapshotForSqlite(db, sqlite, 12, {
    roomId: 'labor',
    placement: 'outside',
  });

  assert.equal(snapshot.items.length, 0);
});

test('buildRoomPanelQueueSnapshot hides visit after return_to_waiting', () => {
  const { db, sqlite, settings, visitId, runtime, listQueue } = setupPanelVisitFlow();
  callVisitTicket(sqlite, runtime, settings, listQueue, visitId, 'labor', 'Labor');

  const before = buildRoomPanelQueueSnapshotForSqlite(db, sqlite, 14, {
    roomId: 'labor',
    placement: 'outside',
  });
  assert.equal(before.items.length, 1);

  returnToWaitingVisitTicket(runtime, visitId);

  const after = buildRoomPanelQueueSnapshotForSqlite(db, sqlite, 15, {
    roomId: 'labor',
    placement: 'outside',
  });
  assert.equal(after.items.length, 0);
});

test('buildRoomPanelQueueSnapshot excludes visits called to another room', () => {
  const { db, sqlite, settings, visitId, runtime, listQueue } = setupPanelVisitFlow();
  callVisitTicket(sqlite, runtime, settings, listQueue, visitId, 'mfa-tresen', 'Empfang');

  const snapshot = buildRoomPanelQueueSnapshotForSqlite(db, sqlite, 13, {
    roomId: 'labor',
    placement: 'outside',
  });

  assert.equal(snapshot.items.length, 0);
});
