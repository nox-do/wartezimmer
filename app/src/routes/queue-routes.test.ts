import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import Fastify from 'fastify';
import { normalizeRoomPanelsSettings } from '@wartezimmer/domain';
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
  arriveVisit,
  callVisit,
  listVisitQueueRows,
} from '../shared/flow-core/visit-queue-bridge.js';
import { WAITING_ROOM_DEVICE_ID } from '../shared/ops/device-ids.js';
import {
  markDeviceStreamConnected,
  resetDevicePresenceForTests,
} from '../shared/ops/device-presence-registry.js';
import { DomainError } from '../shared/errors/domain-error.js';

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
    callVisit: () => transition('waiting', 'called'),
    placeVisitInRoom: () => transition('waiting', 'in_room'),
    reassignRoom: () => transition('called', 'called'),
    setAbsence: () => transition('waiting', 'absent_wait_here'),
    recallVisit: () => ({
      ...transition('absent_wait_here', 'called'),
      returnUntil: '2026-06-18T08:15:00.000Z',
      callbackPhone: null,
      returnWindowMinutes: 15,
    }),
    cycleTriage: (visitId: string) => ({
      visitId,
      triageLevel: 'green',
      updatedAt: '2026-06-18T08:00:00.000Z',
    }),
    ...overrides,
  } as unknown as CoreDatabase;
}

test('POST /api/v1/queue/:visitId/transition dispatches call transitions with room target', async () => {
  resetDevicePresenceForTests();
  markDeviceStreamConnected({ deviceId: WAITING_ROOM_DEVICE_ID, kind: 'tv' });
  const calls: Array<{ visitId: string; roomId?: string; roomLabel?: string }> = [];
  const app = Fastify({ logger: false });
  registerQueueRoutes(
    app,
    buildQueueRouteDb({
      callVisit: (visitId: string, roomId?: string, roomLabel?: string) => {
        calls.push({ visitId, roomId, roomLabel });
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
  assert.deepEqual(calls, [{ visitId: 'A-001', roomId: 'room-1', roomLabel: 'Raum 1' }]);

  await app.close();
  resetDevicePresenceForTests();
});

test('staff check_in_room uses explicit placement and returns its composite status', async () => {
  const placements: Array<{ visitId: string; roomId: string; roomLabel?: string }> = [];
  const app = Fastify({ logger: false });
  registerQueueRoutes(
    app,
    buildQueueRouteDb({
      placeVisitInRoom: (visitId: string, roomId: string, roomLabel?: string) => {
        placements.push({ visitId, roomId, roomLabel });
        return {
          ...transition('waiting', 'in_room'),
          roomId: 'labor',
          roomLabel: 'Labor aktuell',
        };
      },
    }),
  );
  await app.ready();

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/queue/A-001/transition',
    payload: { type: 'check_in_room', roomId: 'labor', roomLabel: 'Veralteter Name' },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().fromStatus, 'waiting');
  assert.equal(response.json().toStatus, 'in_room');
  assert.equal(response.json().roomId, 'labor');
  assert.equal(response.json().roomLabel, 'Labor aktuell');
  assert.deepEqual(placements, [
    { visitId: 'A-001', roomId: 'labor', roomLabel: 'Veralteter Name' },
  ]);

  await app.close();
});

test('staff waiting-room arrival scopes the simple check-in path to pf_waiting', async () => {
  const checkIns: Array<{ visitId: string; actingRoomId?: string; actorId?: string }> = [];
  let placementCalled = false;
  const app = Fastify({ logger: false });
  registerQueueRoutes(
    app,
    buildQueueRouteDb({
      checkInRoom: (visitId: string, actingRoomId?: string, actorId?: string) => {
        checkIns.push({ visitId, actingRoomId, actorId });
        return transition('waiting', 'waiting');
      },
      placeVisitInRoom: () => {
        placementCalled = true;
        return transition('waiting', 'in_room');
      },
    }),
  );
  await app.ready();

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/queue/M-001/transition',
    payload: {
      type: 'check_in_room',
      roomId: 'pf_waiting',
      roomLabel: 'Wartezimmer',
      actingRoomId: 'labor',
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().roomId, 'pf_waiting');
  assert.deepEqual(checkIns, [
    { visitId: 'M-001', actingRoomId: 'pf_waiting', actorId: undefined },
  ]);
  assert.equal(placementCalled, false);

  await app.close();
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
          terminalAssistancePending: false,
          escortTransferPending: false,
        },
      ],
    }),
  );
  await app.ready();

  const response = await app.inject({ method: 'GET', url: '/api/v1/queue' });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().items[0].triageLevel, null);
  assert.equal(response.json().items[0].identityRefEditable, false);

  await app.close();
});

test('POST /api/v1/queue/:visitId/transition dispatches reassign_room with required room', async () => {
  const reassigns: Array<{ visitId: string; roomId?: string; roomLabel?: string }> = [];
  const app = Fastify({ logger: false });
  registerQueueRoutes(
    app,
    buildQueueRouteDb({
      reassignRoom: (visitId: string, roomId?: string, roomLabel?: string) => {
        reassigns.push({ visitId, roomId, roomLabel });
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
  assert.deepEqual(reassigns, [{ visitId: 'A-001', roomId: 'room-2', roomLabel: 'Raum 2' }]);

  await app.close();
});

test('POST /api/v1/queue/:visitId/transition rejects missing required variant fields', async () => {
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

test('POST /api/v1/queue/:visitId/transition dispatches set_absence mode', async () => {
  const absences: Array<{ visitId: string; mode: string }> = [];
  const app = Fastify({ logger: false });
  registerQueueRoutes(
    app,
    buildQueueRouteDb({
      setAbsence: (visitId: string, mode: string) => {
        absences.push({ visitId, mode });
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
  assert.deepEqual(absences, [{ visitId: 'A-001', mode: 'wait_here' }]);

  await app.close();
});

test('POST /api/v1/queue/:visitId/transition dispatches recall without notify phone', async () => {
  const recalls: Array<{ visitId: string; returnWindowMinutes?: number }> = [];
  const app = Fastify({ logger: false });
  registerQueueRoutes(
    app,
    buildQueueRouteDb({
      recallVisit: (visitId: string, returnWindowMinutes?: number) => {
        recalls.push({ visitId, returnWindowMinutes });
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
  assert.deepEqual(recalls, [{ visitId: 'A-001', returnWindowMinutes: 20 }]);

  await app.close();
});

test('POST /api/v1/queue/:visitId/transition dispatches triage marker updates', async () => {
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
    visitId: 'A-001',
    triageLevel: 'green',
    updatedAt: '2026-06-18T08:00:00.000Z',
  });

  await app.close();
});

test('POST /api/v1/queue/:visitId/supersede returns new ticket payload', async () => {
  const calls: Array<{ visitId: string; topicId: string }> = [];
  const app = Fastify({ logger: false });
  registerQueueRoutes(
    app,
    buildQueueRouteDb({
      supersedeVisit: (visitId: string, topicId: string) => {
        calls.push({ visitId, topicId });
        return {
          supersededVisitId: visitId,
          visitId: 'L-002',
          laneCode: 'L',
          number: 2,
          topicId,
          topicLabel: 'Blutabnahme',
          destinationRoomLabel: 'Empfang',
          checkedInAt: '2026-06-18T08:00:00.000Z',
          documentsRebound: 1,
        };
      },
    }),
  );
  await app.ready();

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/queue/M-001/supersede',
    payload: { topicId: 'blut' },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    resultType: 'supersede',
    supersededVisitId: 'M-001',
    visitId: 'L-002',
    laneCode: 'L',
    number: 2,
    topicId: 'blut',
    topicLabel: 'Blutabnahme',
    destinationRoomLabel: 'Empfang',
    checkedInAt: '2026-06-18T08:00:00.000Z',
    documentsRebound: 1,
  });
  assert.deepEqual(calls, [{ visitId: 'M-001', topicId: 'blut' }]);

  await app.close();
});

test('POST /api/v1/queue/:visitId/supersede maps INVALID_TRANSITION to 409', async () => {
  const app = Fastify({ logger: false });
  registerQueueRoutes(
    app,
    buildQueueRouteDb({
      supersedeVisit: () => {
        throw new DomainError('INVALID_TRANSITION');
      },
    }),
  );
  await app.ready();

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/queue/M-001/supersede',
    payload: { topicId: 'blut' },
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().code, 'INVALID_TRANSITION');

  await app.close();
});

test('POST /api/v1/queue/:visitId/transition rejects unknown transition type', async () => {
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
    visitId: string;
    actingRoomId?: string;
    actorId?: string;
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
      checkInRoom: (visitId: string, actingRoomId?: string, actorId?: string) => {
        checkIns.push({ visitId, actingRoomId, actorId });
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
  assert.deepEqual(checkIns, [{ visitId: 'A-001', actingRoomId: 'labor', actorId: 'rp-1' }]);

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
            panels: {
              ...room.panels,
              outside: {
                ...room.panels.outside,
                mode: currentMode,
              },
            },
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

function roomPanelSessionHook(placement: 'outside' | 'inside') {
  return async (request: { clientRole?: string; authSession?: unknown }) => {
    request.clientRole = 'room-panel';
    request.authSession = {
      kind: 'room-panel',
      role: 'room-panel',
      sessionId: 'rp-1',
      roomId: 'labor',
      placement,
      createdAt: '2026-06-18T08:00:00.000Z',
      lastSeenAt: '2026-06-18T08:00:00.000Z',
      idleExpiresAt: '2026-06-18T10:00:00.000Z',
      expiresAt: '2026-06-18T20:00:00.000Z',
    };
  };
}

function insideCallingPanelSettings() {
  return normalizeRoomPanelsSettings({
    outside: {
      enabled: true,
      mode: 'arrival',
      showPatientNames: false,
      calledTextPreset: 'please_enter',
      calledTextCustom: null,
      arrivedTextPreset: 'please_wait_here',
      arrivedTextCustom: null,
    },
    inside: {
      enabled: true,
      mode: 'staff_full',
      showPatientNames: false,
      allowCalling: true,
      calledTextPreset: 'please_enter',
      calledTextCustom: null,
      arrivedTextPreset: 'please_wait_here',
      arrivedTextCustom: null,
    },
  });
}

test('room-panel call transition is forbidden for outside panels', async () => {
  resetDevicePresenceForTests();
  markDeviceStreamConnected({ deviceId: WAITING_ROOM_DEVICE_ID, kind: 'tv' });
  const app = Fastify({ logger: false });
  app.addHook('preHandler', roomPanelSessionHook('outside'));
  registerQueueRoutes(app, buildQueueRouteDb());
  await app.ready();

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/queue/A-001/transition',
    payload: { type: 'call', roomId: 'other-room', roomLabel: 'Other' },
  });

  assert.equal(response.statusCode, 403);
  assert.match(response.json().message, /darf diese Ticket-Aktion nicht/);

  await app.close();
  resetDevicePresenceForTests();
});

test('room-panel call transition is forbidden when allowCalling is disabled', async () => {
  resetDevicePresenceForTests();
  markDeviceStreamConnected({ deviceId: WAITING_ROOM_DEVICE_ID, kind: 'tv' });
  const app = Fastify({ logger: false });
  app.addHook('preHandler', roomPanelSessionHook('inside'));
  registerQueueRoutes(
    app,
    buildQueueRouteDb({
      getOpsSettings: () => ({
        rooms: [
          {
            roomId: 'labor',
            roomLabel: 'Labor',
            enabled: true,
            defaultCallTarget: true,
            maxOccupancy: null,
            panels: normalizeRoomPanelsSettings({
              inside: {
                enabled: true,
                mode: 'staff_full',
                showPatientNames: false,
                allowCalling: false,
              },
            }),
          },
        ],
      }),
    }),
  );
  await app.ready();

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/queue/A-001/transition',
    payload: { type: 'call' },
  });

  assert.equal(response.statusCode, 403);
  assert.match(response.json().message, /nicht aktiviert/);

  await app.close();
  resetDevicePresenceForTests();
});

test('room-panel call transition confirms scoped visit without overriding call target', async () => {
  resetDevicePresenceForTests();
  markDeviceStreamConnected({ deviceId: WAITING_ROOM_DEVICE_ID, kind: 'tv' });
  const { db, visitId } = buildRoomPanelCallRouteDb('labor');
  const calls: Array<{
    visitId: string;
    roomId?: string;
    roomLabel?: string;
    actorId?: string;
  }> = [];
  const wrappedDb = {
    ...db,
    callVisit: (targetVisitId: string, roomId?: string, roomLabel?: string, actorId?: string) => {
      calls.push({ visitId: targetVisitId, roomId, roomLabel, actorId });
      return transition('waiting', 'called');
    },
  } as CoreDatabase;
  const app = Fastify({ logger: false });
  app.addHook('preHandler', roomPanelSessionHook('inside'));
  registerQueueRoutes(app, wrappedDb);
  await app.ready();

  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/queue/${visitId}/transition`,
    payload: { type: 'call', roomId: 'other-room', roomLabel: 'Other' },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, [{ visitId, roomId: undefined, roomLabel: undefined, actorId: 'rp-1' }]);
  assert.equal(response.json().roomId, 'labor');
  assert.equal(response.json().roomLabel, 'Labor');

  await app.close();
  resetDevicePresenceForTests();
});

test('room-panel call transition rejects visits targeting another room', async () => {
  resetDevicePresenceForTests();
  markDeviceStreamConnected({ deviceId: WAITING_ROOM_DEVICE_ID, kind: 'tv' });
  const { db, visitId } = buildRoomPanelCallRouteDb('mfa-tresen');
  const app = Fastify({ logger: false });
  app.addHook('preHandler', roomPanelSessionHook('inside'));
  registerQueueRoutes(app, db);
  await app.ready();

  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/queue/${visitId}/transition`,
    payload: { type: 'call' },
  });

  assert.equal(response.statusCode, 409);
  assert.match(response.json().message, /Ziel dieses Raums/);

  await app.close();
  resetDevicePresenceForTests();
});

test('room-panel call transition returns 409 when WZ-TV is offline', async () => {
  resetDevicePresenceForTests();
  const app = Fastify({ logger: false });
  app.addHook('preHandler', roomPanelSessionHook('inside'));
  registerQueueRoutes(
    app,
    buildQueueRouteDb({
      getOpsSettings: () => ({
        rooms: [
          {
            roomId: 'labor',
            roomLabel: 'Labor',
            enabled: true,
            defaultCallTarget: true,
            maxOccupancy: null,
            panels: insideCallingPanelSettings(),
          },
        ],
      }),
    }),
  );
  await app.ready();

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/queue/A-001/transition',
    payload: { type: 'call' },
  });

  assert.equal(response.statusCode, 409);
  assert.match(response.json().message, /Wartezimmer-Anzeige ist offline/);

  await app.close();
  resetDevicePresenceForTests();
});

function buildRoomPanelCallRouteDb(targetRoomId: 'labor' | 'mfa-tresen'): {
  db: CoreDatabase;
  visitId: string;
} {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  ensureFlowCoreSchema(sqlite);
  const settings = tvQueueTestSettings();
  const labor = settings.rooms.find((room) => room.roomId === 'labor')!;
  labor.panels = insideCallingPanelSettings();
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
    expireActiveSessionsByVisitStmt: sqlite.prepare('SELECT 1'),
    getActiveSessionByVisitStmt: sqlite.prepare('SELECT 1'),
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
    identityRef: 'Scope Test',
  });
  const runtime = getFlowCoreRuntime(sqlite);
  runtime.redirect(created.visitId, {
    queueId: null,
    targetLocationId: targetRoomId,
    movementMode: 'call',
    publicDisplayMode: 'visible',
    actorSurfaceId: 'pf_mfa_dashboard',
  });

  const listQueue = () => listVisitQueueRows(runtime, settings, getBusinessDay());
  const db = {
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
    getOpsSettings: () => settings,
    getFlowCoreRuntimeInstance: () => runtime,
    getOpsState: () => ({ checkinLocked: false, dayClosePhase: 'open' as const }),
    listQueue,
    callVisit: (visitId: string, roomId?: string, roomLabel?: string) =>
      callVisit(sqlite, runtime, settings, listQueue, visitId, roomId, roomLabel),
  } as unknown as CoreDatabase;

  return { db, visitId: created.visitId };
}

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

function buildTvQueueRouteDb(): { db: CoreDatabase; visitId: string } {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  ensureFlowCoreSchema(sqlite);
  const settings = tvQueueTestSettings();
  syncFlowCoreCatalog(sqlite, settings);
  sqlite
    .prepare("UPDATE routing_rules SET initial_movement_mode = 'call' WHERE topic_id = 'blut'")
    .run();

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
    expireActiveSessionsByVisitStmt: sqlite.prepare('SELECT 1'),
    getActiveSessionByVisitStmt: sqlite.prepare('SELECT 1'),
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
    callVisit: (visitId: string, roomId?: string, roomLabel?: string) =>
      callVisit(sqlite, runtime, settings, listQueue, visitId, roomId, roomLabel),
  } as unknown as CoreDatabase;

  return { db, sqlite, visitId: created.visitId };
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

  db.callVisit(visitId, 'labor', 'Labor');
  const called = await app.inject({
    method: 'GET',
    url: '/api/v1/queue',
    headers: { 'x-client-role': 'tv' },
  });
  assert.equal(called.json().items.length, 1);
  assert.equal(called.json().items[0].status, 'called');
  assert.equal(called.json().items[0].roomLabel, 'Labor');

  arriveVisit(sqlite, db.getFlowCoreRuntimeInstance(), visitId, 'labor');
  const arrived = await app.inject({
    method: 'GET',
    url: '/api/v1/queue',
    headers: { 'x-client-role': 'tv' },
  });
  assert.equal(arrived.json().items.length, 0);

  await app.close();
});

test('supersede returns registration limit as 409 with the host hint', async () => {
  const app = Fastify({ logger: false });
  registerQueueRoutes(
    app,
    buildQueueRouteDb({
      supersedeVisit: () => {
        throw new DomainError('REGISTRATION_LIMIT_REACHED');
      },
    }),
  );
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/queue/M-001/supersede',
      payload: { topicId: 'blut' },
    });
    assert.equal(response.statusCode, 409);
    assert.equal(response.json().code, 'REGISTRATION_LIMIT_REACHED');
    assert.equal(
      response.json().message,
      'Technisch bedingt sind pro Kennbuchstabe der Themen nur 999 Anmeldungen pro Praxistag möglich.',
    );
  } finally {
    await app.close();
  }
});

test('callback phone API rejects missing or false oral consent', async () => {
  const app = Fastify({ logger: false });
  let called = false;
  registerQueueRoutes(
    app,
    buildQueueRouteDb({
      setCallbackPhone: () => {
        called = true;
      },
    }),
  );
  try {
    for (const consent of [undefined, false]) {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/queue/A-001/callback-phone',
        payload: { callbackPhone: '+4917612345678', recallConsentConfirmed: consent },
      });
      assert.equal(response.statusCode, 400);
    }
    assert.equal(called, false);
  } finally {
    await app.close();
  }
});

test('absence API requires oral consent for a non-empty notification number', async () => {
  const app = Fastify({ logger: false });
  let called = false;
  registerQueueRoutes(
    app,
    buildQueueRouteDb({
      setAbsence: () => {
        called = true;
      },
    }),
  );
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/queue/A-001/transition',
      payload: { type: 'set_absence', mode: 'wait_here', callbackPhone: '+4917612345678' },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(called, false);
  } finally {
    await app.close();
  }
});

test('absence API accepts the dashboard phone and consent payload', async () => {
  const app = Fastify({ logger: false });
  const received: unknown[] = [];
  registerQueueRoutes(
    app,
    buildQueueRouteDb({
      setAbsence: (...args: unknown[]) => {
        received.push(args);
        return transition('waiting', 'absent_wait_here');
      },
    }),
  );
  try {
    for (const callbackPhone of ['01721234567', '+491721234567', '']) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/queue/20261008-L-001/transition',
        payload: {
          type: 'set_absence',
          mode: 'wait_here',
          callbackPhone,
          recallConsentConfirmed: Boolean(callbackPhone),
        },
      });
      assert.equal(response.statusCode, 200, response.body);
    }
    assert.equal(received.length, 3);
  } finally {
    await app.close();
  }
});

test('check_out_room awaits document cleanup and reports sandbox failure as 502', async () => {
  const app = Fastify({ logger: false });
  registerQueueRoutes(
    app,
    buildQueueRouteDb({
      checkOutRoom: async () => {
        throw new Error('SANDBOX_DELETE_UNREACHABLE');
      },
    }),
  );
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/queue/A-001/transition',
      payload: { type: 'check_out_room' },
    });
    assert.equal(response.statusCode, 502);
    assert.equal(response.json().code, 'SANDBOX_UNAVAILABLE');
  } finally {
    await app.close();
  }
});
