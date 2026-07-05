import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import Fastify from 'fastify';
import { registerQueueRoutes } from './queue-routes.js';
import type { CoreDatabase } from '../shared/db/database.js';
import { DEFAULT_TERMINAL_TOPIC_DEFINITIONS } from '../shared/checkin-topic-settings.js';
import type { CheckinSessionDeps } from '../shared/db/database-checkin-sessions.js';
import { getBusinessDay, normalizeDayClosePhase } from '../shared/db/database-time.js';
import type { OpsSettings } from '../shared/db/db-types.js';
import { createVisitCheckInInDb } from '../shared/flow-core/flow-core-checkin.js';
import { syncFlowCoreCatalog, getFlowCoreRuntime } from '../shared/flow-core/flow-core-runtime.js';
import { ensureFlowCoreSchema } from '../shared/flow-core/flow-core-schema.js';
import {
  arriveVisitTicket,
  callVisitTicket,
  listVisitQueueRows,
} from '../shared/flow-core/visit-queue-bridge.js';
import { WAITING_ROOM_DEVICE_ID } from '../shared/ops/device-ids.js';
import {
  markDeviceStreamConnected,
  resetDevicePresenceForTests,
} from '../shared/ops/device-presence-registry.js';

type QueueRouteDbOverrides = Partial<Record<keyof CoreDatabase, unknown>>;

function transition(fromStatus: string, toStatus: string) {
  return { fromStatus, toStatus };
}

function buildQueueRouteDb(overrides: QueueRouteDbOverrides = {}): CoreDatabase {
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
    }),
    listQueue: () => [],
    listActiveTerminalAssistPending: () => [],
    isCheckinLocked: () => false,
    isEffectiveCheckinLocked: () => false,
    processExpiredRecallWindows: () => [],
    getQueueSummary: () => ({
      waitingNow: 0,
      calledNow: 0,
      inRoomNow: 0,
      absentNow: 0,
      processedToday: 0,
    }),
    getOpsState: () => ({ checkinLocked: false, dayClosePhase: 'open' }),
    callTicket: () => transition('waiting', 'called'),
    reassignRoom: () => transition('called', 'called'),
    setAbsence: () => transition('waiting', 'absent_wait_here'),
    recallTicket: () => ({
      ...transition('absent_wait_here', 'called'),
      returnUntil: '2026-06-18T08:15:00.000Z',
      callbackPhone: null,
      returnWindowMinutes: 15,
    }),
    cycleTriage: (ticketId: string) => ({
      ticketId,
      triageLevel: 'green',
      updatedAt: '2026-06-18T08:00:00.000Z',
    }),
    ...overrides,
  } as unknown as CoreDatabase;
}

test('POST /api/v1/queue/:ticket/transition dispatches call transitions with room target', async () => {
  resetDevicePresenceForTests();
  markDeviceStreamConnected({ deviceId: WAITING_ROOM_DEVICE_ID, kind: 'tv' });
  const calls: Array<{ ticketId: string; roomId?: string; roomLabel?: string }> = [];
  const app = Fastify({ logger: false });
  registerQueueRoutes(
    app,
    buildQueueRouteDb({
      callTicket: (ticketId: string, roomId?: string, roomLabel?: string) => {
        calls.push({ ticketId, roomId, roomLabel });
        return transition('waiting', 'called');
      },
    }),
  );
  await app.ready();

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/queue/A-001/transition',
    payload: { type: 'call', roomId: 'room-1', roomLabel: 'Raum 1' },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().toStatus, 'called');
  assert.equal(response.json().roomId, 'room-1');
  assert.deepEqual(calls, [{ ticketId: 'A-001', roomId: 'room-1', roomLabel: 'Raum 1' }]);

  await app.close();
  resetDevicePresenceForTests();
});

test('GET /api/v1/queue rejects room-panel sessions after placement changes', async () => {
  const app = Fastify({ logger: false });
  app.addHook('preHandler', async (request) => {
    request.clientRole = 'room-panel';
    request.authSession = {
      kind: 'room-panel',
      role: 'room-panel',
      sessionId: 'panel-session',
      roomId: 'labor',
      placement: 'inside',
      expiresAt: '2026-06-18T10:00:00.000Z',
      idleExpiresAt: '2026-06-18T10:00:00.000Z',
    };
  });
  registerQueueRoutes(app, buildQueueRouteDb());
  await app.ready();

  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/queue',
    headers: { 'x-client-role': 'room-panel' },
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json().code, 'AUTH_FORBIDDEN');

  await app.close();
});

test('GET /api/v1/queue serializes MFA items with empty triage marker', async () => {
  const app = Fastify({ logger: false });
  registerQueueRoutes(
    app,
    buildQueueRouteDb({
      listQueue: () => [
        {
          id: 'A-001',
          laneCode: 'A',
          number: 1,
          topicId: 'offen',
          topicLabel: 'Offene Sprechstunde',
          destinationRoomId: 'labor',
          destinationRoomLabel: 'Labor',
          status: 'waiting',
          createdAt: '2026-06-18T08:00:00.000Z',
          calledAt: null,
          identityRef: null,
          checkinPhone: null,
          roomId: null,
          roomLabel: null,
          callbackPhone: null,
          recallNotifyErrorCode: null,
          recallNotifySent: false,
          returnUntil: null,
          triageLevel: null,
          documentCount: 0,
          needsAssistance: false,
        },
      ],
    }),
  );
  await app.ready();

  const response = await app.inject({ method: 'GET', url: '/api/v1/queue' });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().items[0].triageLevel, null);

  await app.close();
});

test('POST /api/v1/queue/:ticket/transition dispatches reassign_room with required room', async () => {
  const reassigns: Array<{ ticketId: string; roomId?: string; roomLabel?: string }> = [];
  const app = Fastify({ logger: false });
  registerQueueRoutes(
    app,
    buildQueueRouteDb({
      reassignRoom: (ticketId: string, roomId?: string, roomLabel?: string) => {
        reassigns.push({ ticketId, roomId, roomLabel });
        return transition('called', 'called');
      },
    }),
  );
  await app.ready();

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/queue/A-001/transition',
    payload: { type: 'reassign_room', roomId: 'room-2', roomLabel: 'Raum 2' },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(reassigns, [{ ticketId: 'A-001', roomId: 'room-2', roomLabel: 'Raum 2' }]);

  await app.close();
});

test('POST /api/v1/queue/:ticket/transition rejects missing required variant fields', async () => {
  const app = Fastify({ logger: false });
  registerQueueRoutes(app, buildQueueRouteDb());
  await app.ready();

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/queue/A-001/transition',
    payload: { type: 'reassign_room' },
  });

  assert.equal(response.statusCode, 400);

  await app.close();
});

test('POST /api/v1/queue/:ticket/transition dispatches set_absence mode', async () => {
  const absences: Array<{ ticketId: string; mode: string }> = [];
  const app = Fastify({ logger: false });
  registerQueueRoutes(
    app,
    buildQueueRouteDb({
      setAbsence: (ticketId: string, mode: string) => {
        absences.push({ ticketId, mode });
        return transition('waiting', 'absent_wait_here');
      },
    }),
  );
  await app.ready();

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/queue/A-001/transition',
    payload: { type: 'set_absence', mode: 'wait_here' },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().toStatus, 'absent_wait_here');
  assert.deepEqual(absences, [{ ticketId: 'A-001', mode: 'wait_here' }]);

  await app.close();
});

test('POST /api/v1/queue/:ticket/transition dispatches recall without notify phone', async () => {
  const recalls: Array<{ ticketId: string; returnWindowMinutes?: number }> = [];
  const app = Fastify({ logger: false });
  registerQueueRoutes(
    app,
    buildQueueRouteDb({
      recallTicket: (ticketId: string, returnWindowMinutes?: number) => {
        recalls.push({ ticketId, returnWindowMinutes });
        return {
          ...transition('absent_wait_here', 'called'),
          returnUntil: '2026-06-18T08:15:00.000Z',
          callbackPhone: null,
          returnWindowMinutes: 15,
        };
      },
    }),
  );
  await app.ready();

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/queue/A-001/transition',
    payload: { type: 'recall', returnWindowMinutes: 20 },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().returnUntil, '2026-06-18T08:15:00.000Z');
  assert.equal(response.json().smsDispatch, null);
  assert.deepEqual(recalls, [{ ticketId: 'A-001', returnWindowMinutes: 20 }]);

  await app.close();
});

test('POST /api/v1/queue/:ticket/transition dispatches triage marker updates', async () => {
  const app = Fastify({ logger: false });
  registerQueueRoutes(app, buildQueueRouteDb());
  await app.ready();

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/queue/A-001/transition',
    payload: { type: 'cycle_triage' },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    resultType: 'triage',
    ticketId: 'A-001',
    triageLevel: 'green',
    updatedAt: '2026-06-18T08:00:00.000Z',
  });

  await app.close();
});

test('POST /api/v1/queue/:ticket/transition rejects unknown transition type', async () => {
  const app = Fastify({ logger: false });
  registerQueueRoutes(app, buildQueueRouteDb());
  await app.ready();

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/queue/A-001/transition',
    payload: { type: 'unknown_action' },
  });

  assert.equal(response.statusCode, 400);

  await app.close();
});

test('legacy per-action queue ticket routes are removed', async () => {
  const app = Fastify({ logger: false });
  registerQueueRoutes(app, buildQueueRouteDb());
  await app.ready();

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/queue/A-001/cycle-triage',
    payload: {},
  });

  assert.equal(response.statusCode, 404);

  await app.close();
});

test('room-panel transition uses session room for check_in_room and ignores body actingRoomId', async () => {
  const checkIns: Array<{
    ticketId: string;
    roomId?: string;
    roomLabel?: string;
    actingRoomId?: string;
  }> = [];
  const app = Fastify({ logger: false });
  app.addHook('preHandler', async (request) => {
    request.clientRole = 'room-panel';
    request.authSession = {
      kind: 'room-panel',
      role: 'room-panel',
      sessionId: 'rp-1',
      roomId: 'labor',
      placement: 'outside',
      createdAt: '2026-06-18T08:00:00.000Z',
      lastSeenAt: '2026-06-18T08:00:00.000Z',
      idleExpiresAt: '2026-06-18T10:00:00.000Z',
      expiresAt: '2026-06-18T20:00:00.000Z',
    };
  });
  registerQueueRoutes(
    app,
    buildQueueRouteDb({
      checkInRoom: (
        ticketId: string,
        roomId?: string,
        roomLabel?: string,
        actingRoomId?: string,
      ) => {
        checkIns.push({ ticketId, roomId, roomLabel, actingRoomId });
        return transition('called', 'in_room');
      },
    }),
  );
  await app.ready();

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/queue/A-001/transition',
    payload: { type: 'check_in_room', roomId: 'other', roomLabel: 'Other', actingRoomId: 'other' },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(checkIns, [
    { ticketId: 'A-001', roomId: undefined, roomLabel: undefined, actingRoomId: 'labor' },
  ]);

  await app.close();
});

test('room-panel transition allows check_out_room only for staff_full sessions', async () => {
  const app = Fastify({ logger: false });
  app.addHook('preHandler', async (request) => {
    request.clientRole = 'room-panel';
    request.authSession = {
      kind: 'room-panel',
      role: 'room-panel',
      sessionId: 'rp-1',
      roomId: 'labor',
      placement: 'outside',
      createdAt: '2026-06-18T08:00:00.000Z',
      lastSeenAt: '2026-06-18T08:00:00.000Z',
      idleExpiresAt: '2026-06-18T10:00:00.000Z',
      expiresAt: '2026-06-18T20:00:00.000Z',
    };
  });
  registerQueueRoutes(app, buildQueueRouteDb());
  await app.ready();

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/queue/A-001/transition',
    payload: { type: 'check_out_room' },
  });

  assert.equal(response.statusCode, 403);

  await app.close();
});

test('room-panel transition uses the current mode without a new login', async () => {
  let currentMode: 'display_only' | 'arrival' = 'display_only';
  const baseDb = buildQueueRouteDb();
  const app = Fastify({ logger: false });
  app.addHook('preHandler', async (request) => {
    request.clientRole = 'room-panel';
    request.authSession = {
      kind: 'room-panel',
      role: 'room-panel',
      sessionId: 'rp-live-mode',
      roomId: 'labor',
      placement: 'outside',
      createdAt: '2026-06-18T08:00:00.000Z',
      lastSeenAt: '2026-06-18T08:00:00.000Z',
      idleExpiresAt: '2026-06-18T10:00:00.000Z',
      expiresAt: '2026-06-18T20:00:00.000Z',
    };
  });
  registerQueueRoutes(
    app,
    buildQueueRouteDb({
      getOpsSettings: () => {
        const settings = baseDb.getOpsSettings();
        return {
          ...settings,
          rooms: settings.rooms.map((room) => ({
            ...room,
            panel: room.panel ? { ...room.panel, mode: currentMode } : undefined,
          })),
        };
      },
      checkInRoom: () => transition('called', 'in_room'),
    }),
  );
  await app.ready();

  const disabled = await app.inject({
    method: 'POST',
    url: '/api/v1/queue/A-001/transition',
    payload: { type: 'check_in_room' },
  });
  assert.equal(disabled.statusCode, 403);

  currentMode = 'arrival';
  const enabled = await app.inject({
    method: 'POST',
    url: '/api/v1/queue/A-001/transition',
    payload: { type: 'check_in_room' },
  });
  assert.equal(enabled.statusCode, 200);

  await app.close();
});

function tvQueueTestSettings(): OpsSettings {
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

function buildTvQueueRouteDb(): { db: CoreDatabase; visitId: string } {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  ensureFlowCoreSchema(sqlite);
  const settings = tvQueueTestSettings();
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
    identityRef: 'TV Route Test',
  });

  const runtime = getFlowCoreRuntime(sqlite);
  const listQueue = () => listVisitQueueRows(runtime, settings, getBusinessDay());

  const db = {
    getOpsSettings: () => settings,
    listQueue,
    isCheckinLocked: () => false,
    isEffectiveCheckinLocked: () => false,
    processExpiredRecallWindows: () => [],
    getQueueSummary: () => ({
      waitingNow: 0,
      calledNow: 0,
      inRoomNow: 0,
      absentNow: 0,
      processedToday: 0,
    }),
    getOpsState: () => ({ checkinLocked: false, dayClosePhase: 'open' }),
    getFlowCoreRuntimeInstance: () => runtime,
    callTicket: (ticketId: string, roomId?: string, roomLabel?: string) =>
      callVisitTicket(sqlite, runtime, settings, listQueue, ticketId, roomId, roomLabel),
  } as unknown as CoreDatabase;

  return { db, sqlite, visitId: created.ticketId };
}

test('GET /api/v1/queue with tv role returns explainVisibility-filtered items', async () => {
  const { db, sqlite, visitId } = buildTvQueueRouteDb();
  const app = Fastify({ logger: false });
  app.addHook('preHandler', async (request) => {
    request.clientRole = 'tv';
  });
  registerQueueRoutes(app, db);
  await app.ready();

  const waiting = await app.inject({
    method: 'GET',
    url: '/api/v1/queue',
    headers: { 'x-client-role': 'tv' },
  });
  assert.equal(waiting.statusCode, 200);
  assert.equal(waiting.json().view, 'tv');
  assert.equal(waiting.json().items.length, 1);
  assert.equal(waiting.json().items[0].status, 'waiting');
  assert.equal(waiting.json().items[0].laneCode, 'L');

  db.callTicket(visitId, 'labor', 'Labor');
  const called = await app.inject({
    method: 'GET',
    url: '/api/v1/queue',
    headers: { 'x-client-role': 'tv' },
  });
  assert.equal(called.json().items.length, 1);
  assert.equal(called.json().items[0].status, 'called');
  assert.equal(called.json().items[0].roomLabel, 'Labor');

  arriveVisitTicket(sqlite, db.getFlowCoreRuntimeInstance(), visitId, 'labor');
  const arrived = await app.inject({
    method: 'GET',
    url: '/api/v1/queue',
    headers: { 'x-client-role': 'tv' },
  });
  assert.equal(arrived.json().items.length, 0);

  await app.close();
});
