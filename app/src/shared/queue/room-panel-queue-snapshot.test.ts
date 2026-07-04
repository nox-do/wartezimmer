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
  buildRoomPanelQueueSnapshot,
  buildRoomPanelQueueSnapshotForSqlite,
  compareRoomPanelCallOrder,
} from './room-panel-queue-snapshot.js';

function dbForSnapshot(): CoreDatabase {
  return {
    getOpsSettings: () => ({
      rooms: [
        {
          roomId: 'labor',
          roomLabel: 'Labor',
          enabled: true,
          defaultCallTarget: true,
          maxOccupancy: null,
          panel: {
            enabled: true,
            placement: 'inside',
            mode: 'staff_full',
            showPatientNames: false,
            calledTextPreset: 'please_enter',
            calledTextCustom: null,
            arrivedTextPreset: 'please_wait_here',
            arrivedTextCustom: null,
          },
        },
      ],
    }),
    getFlowCoreRuntimeInstance: () =>
      ({
        catalog: () => ({ surfaces: [], surfaceDisplayRules: [] }),
        visits: () => [],
      }) as unknown as ReturnType<typeof getFlowCoreRuntime>,
    listQueue: () => [
      {
        id: 'A-001',
        laneCode: 'A',
        number: 1,
        topicId: 'offen',
        topicLabel: 'Offen',
        destinationRoomId: 'labor',
        destinationRoomLabel: 'Labor',
        status: 'called',
        createdAt: '2026-06-18T08:00:00.000Z',
        calledAt: '2026-06-18T09:00:00.000Z',
        identityRef: 'M. Beispiel',
        checkinPhone: null,
        roomId: 'labor',
        roomLabel: 'Labor',
        callbackPhone: null,
        recallNotifyErrorCode: null,
        recallNotifySent: false,
        returnUntil: null,
        triageLevel: null,
        documentCount: 0,
      },
      {
        id: 'A-002',
        laneCode: 'A',
        number: 2,
        topicId: 'offen',
        topicLabel: 'Offen',
        destinationRoomId: 'empfang',
        destinationRoomLabel: 'Empfang',
        status: 'called',
        createdAt: '2026-06-18T08:01:00.000Z',
        calledAt: '2026-06-18T09:01:00.000Z',
        identityRef: 'Andere Person',
        checkinPhone: null,
        roomId: 'empfang',
        roomLabel: 'Empfang',
        callbackPhone: null,
        recallNotifyErrorCode: null,
        recallNotifySent: false,
        returnUntil: null,
        triageLevel: null,
        documentCount: 0,
      },
      {
        id: 'A-003',
        laneCode: 'A',
        number: 3,
        topicId: 'offen',
        topicLabel: 'Offen',
        destinationRoomId: 'labor',
        destinationRoomLabel: 'Labor',
        status: 'done',
        createdAt: '2026-06-18T08:02:00.000Z',
        calledAt: '2026-06-18T09:02:00.000Z',
        identityRef: 'Fertig',
        checkinPhone: null,
        roomId: 'labor',
        roomLabel: 'Labor',
        callbackPhone: null,
        recallNotifyErrorCode: null,
        recallNotifySent: false,
        returnUntil: null,
        triageLevel: null,
        documentCount: 0,
      },
    ],
  } as unknown as CoreDatabase;
}

test('buildRoomPanelQueueSnapshot filters to session room and hides names by default', () => {
  const snapshot = buildRoomPanelQueueSnapshot(dbForSnapshot(), 7, {
    roomId: 'labor',
    placement: 'inside',
  });

  assert.equal(snapshot.view, 'room-panel');
  assert.equal(snapshot.revision, 7);
  assert.equal(snapshot.roomId, 'labor');
  assert.equal(snapshot.roomLabel, 'Labor');
  assert.deepEqual(
    snapshot.items.map((item) => item.ticketId),
    ['A-001'],
  );
  assert.equal('identityRef' in snapshot.items[0]!, false);
});

test('buildRoomPanelQueueSnapshot includes identityRef only when room setting allows names', () => {
  const db = {
    ...dbForSnapshot(),
    getOpsSettings: () => ({
      rooms: [
        {
          roomId: 'labor',
          roomLabel: 'Labor',
          enabled: true,
          defaultCallTarget: true,
          maxOccupancy: null,
          panel: {
            enabled: true,
            placement: 'inside',
            mode: 'staff_full',
            showPatientNames: true,
            calledTextPreset: 'please_enter',
            calledTextCustom: null,
            arrivedTextPreset: 'please_wait_here',
            arrivedTextCustom: null,
          },
        },
      ],
    }),
  } as unknown as CoreDatabase;

  const snapshot = buildRoomPanelQueueSnapshot(db, 8, {
    roomId: 'labor',
    placement: 'inside',
  });

  assert.equal(snapshot.items[0]?.identityRef, 'M. Beispiel');
});

test('buildRoomPanelQueueSnapshot sorts room items by calledAt, not check-in time', () => {
  const db = {
    ...dbForSnapshot(),
    listQueue: () => [
      {
        id: 'M-003',
        laneCode: 'M',
        number: 3,
        topicId: 'labor',
        topicLabel: 'Blutabnahme',
        destinationRoomId: 'labor',
        destinationRoomLabel: 'Labor',
        status: 'called',
        createdAt: '2026-06-18T07:00:00.000Z',
        calledAt: '2026-06-18T09:20:00.000Z',
        identityRef: null,
        checkinPhone: null,
        roomId: 'labor',
        roomLabel: 'Labor',
        callbackPhone: null,
        recallNotifyErrorCode: null,
        recallNotifySent: false,
        returnUntil: null,
        triageLevel: null,
        documentCount: 0,
      },
      {
        id: 'M-001',
        laneCode: 'M',
        number: 1,
        topicId: 'labor',
        topicLabel: 'Blutabnahme',
        destinationRoomId: 'labor',
        destinationRoomLabel: 'Labor',
        status: 'called',
        createdAt: '2026-06-18T08:00:00.000Z',
        calledAt: '2026-06-18T09:00:00.000Z',
        identityRef: null,
        checkinPhone: null,
        roomId: 'labor',
        roomLabel: 'Labor',
        callbackPhone: null,
        recallNotifyErrorCode: null,
        recallNotifySent: false,
        returnUntil: null,
        triageLevel: null,
        documentCount: 0,
      },
      {
        id: 'M-002',
        laneCode: 'M',
        number: 2,
        topicId: 'labor',
        topicLabel: 'Blutabnahme',
        destinationRoomId: 'labor',
        destinationRoomLabel: 'Labor',
        status: 'in_room',
        createdAt: '2026-06-18T08:30:00.000Z',
        calledAt: '2026-06-18T09:10:00.000Z',
        identityRef: null,
        checkinPhone: null,
        roomId: 'labor',
        roomLabel: 'Labor',
        callbackPhone: null,
        recallNotifyErrorCode: null,
        recallNotifySent: false,
        returnUntil: null,
        triageLevel: null,
        documentCount: 0,
      },
    ],
  } as unknown as CoreDatabase;

  const snapshot = buildRoomPanelQueueSnapshot(db, 9, {
    roomId: 'labor',
    placement: 'inside',
  });

  assert.deepEqual(
    snapshot.items.map((item) => item.ticketId),
    ['M-001', 'M-002', 'M-003'],
  );
});

test('compareRoomPanelCallOrder falls back to createdAt when calledAt is missing', () => {
  assert.ok(
    compareRoomPanelCallOrder(
      { calledAt: null, createdAt: '2026-06-18T08:00:00.000Z' },
      { calledAt: null, createdAt: '2026-06-18T09:00:00.000Z' },
    ) < 0,
  );
});

function panelTestSettings(): OpsSettings {
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

function setupPanelVisitFlow(): {
  sqlite: DatabaseSync;
  db: CoreDatabase;
  settings: OpsSettings;
  visitId: string;
  runtime: ReturnType<typeof getFlowCoreRuntime>;
  listQueue: () => ReturnType<typeof listVisitQueueRows>;
} {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  ensureFlowCoreSchema(sqlite);
  const settings = panelTestSettings();
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
    getNextTicketNumberStmt: sqlite.prepare('SELECT 1'),
    insertTicketStmt: sqlite.prepare('SELECT 1'),
    insertQueueEntryStmt: sqlite.prepare('SELECT 1'),
    checkinLockStmt: sqlite.prepare('SELECT checkin_locked AS locked FROM ops_state WHERE id = 1'),
    dayCloseStateStmt: sqlite.prepare(
      'SELECT checkin_locked AS locked, day_close_phase AS phase, last_reset_business_day AS lastResetBusinessDay FROM ops_state WHERE id = 1',
    ),
    updateCheckinLockStmt: sqlite.prepare('SELECT 1'),
    getTicketIdentityViewStmt: sqlite.prepare('SELECT 1'),
    getTicketPortalContextStmt: sqlite.prepare('SELECT 1'),
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
    listQueue,
    getFlowCoreRuntimeInstance: () => runtime,
  } as unknown as CoreDatabase;

  return { sqlite, db, settings, visitId: created.ticketId, runtime, listQueue };
}

test('buildRoomPanelQueueSnapshot shows called visit for panel room via explainVisibility', () => {
  const { db, sqlite, settings, visitId, runtime, listQueue } = setupPanelVisitFlow();
  callVisitTicket(runtime, settings, listQueue, visitId, 'labor', 'Labor');

  const snapshot = buildRoomPanelQueueSnapshotForSqlite(
    db,
    sqlite,
    listQueue,
    10,
    { roomId: 'labor', placement: 'outside' },
  );

  assert.equal(snapshot.items.length, 1);
  assert.equal(snapshot.items[0]?.status, 'called');
  assert.equal(snapshot.items[0]?.laneCode, 'L');
});

test('buildRoomPanelQueueSnapshot maps arrived visit to in_room for panel room', () => {
  const { db, sqlite, settings, visitId, runtime, listQueue } = setupPanelVisitFlow();
  callVisitTicket(runtime, settings, listQueue, visitId, 'labor', 'Labor');
  arriveVisitTicket(runtime, visitId, 'labor');

  const snapshot = buildRoomPanelQueueSnapshotForSqlite(
    db,
    sqlite,
    listQueue,
    11,
    { roomId: 'labor', placement: 'outside' },
  );

  assert.equal(snapshot.items.length, 1);
  assert.equal(snapshot.items[0]?.status, 'in_room');
});

test('buildRoomPanelQueueSnapshot hides visit after done', () => {
  const { db, sqlite, settings, visitId, runtime, listQueue } = setupPanelVisitFlow();
  callVisitTicket(runtime, settings, listQueue, visitId, 'labor', 'Labor');
  arriveVisitTicket(runtime, visitId, 'labor');
  doneVisitTicket(runtime, visitId, 'labor');

  const snapshot = buildRoomPanelQueueSnapshotForSqlite(
    db,
    sqlite,
    listQueue,
    12,
    { roomId: 'labor', placement: 'outside' },
  );

  assert.equal(snapshot.items.length, 0);
});

test('buildRoomPanelQueueSnapshot hides visit after return_to_waiting', () => {
  const { db, sqlite, settings, visitId, runtime, listQueue } = setupPanelVisitFlow();
  callVisitTicket(runtime, settings, listQueue, visitId, 'labor', 'Labor');

  const before = buildRoomPanelQueueSnapshotForSqlite(
    db,
    sqlite,
    listQueue,
    14,
    { roomId: 'labor', placement: 'outside' },
  );
  assert.equal(before.items.length, 1);

  returnToWaitingVisitTicket(runtime, visitId);

  const after = buildRoomPanelQueueSnapshotForSqlite(
    db,
    sqlite,
    listQueue,
    15,
    { roomId: 'labor', placement: 'outside' },
  );
  assert.equal(after.items.length, 0);
});

test('buildRoomPanelQueueSnapshot excludes visits called to another room', () => {
  const { db, sqlite, settings, visitId, runtime, listQueue } = setupPanelVisitFlow();
  callVisitTicket(runtime, settings, listQueue, visitId, 'mfa-tresen', 'Empfang');

  const snapshot = buildRoomPanelQueueSnapshotForSqlite(
    db,
    sqlite,
    listQueue,
    13,
    { roomId: 'labor', placement: 'outside' },
  );

  assert.equal(snapshot.items.length, 0);
});
