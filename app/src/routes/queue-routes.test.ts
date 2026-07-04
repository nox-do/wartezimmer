import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import { registerQueueRoutes } from './queue-routes.js';
import type { CoreDatabase } from '../shared/db/database.js';
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
