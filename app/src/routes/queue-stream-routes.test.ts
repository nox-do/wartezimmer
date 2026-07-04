import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test, { afterEach, beforeEach } from 'node:test';
import Fastify from 'fastify';
import { registerClientAuth } from '../auth/client-auth.js';
import {
  getDeviceSessionCookieName,
  getRoomPanelSessionCookieName,
  getStaffSessionCookieName,
  createStaffSessionManager,
} from '../auth/staff-session-auth.js';
import type { CoreDatabase } from '../shared/db/database.js';
import {
  listDevicePresence,
  resetDevicePresenceForTests,
  WAITING_ROOM_DEVICE_ID,
} from '../shared/ops/device-presence-registry.js';
import { registerQueueStreamRoutes } from './queue-stream-routes.js';

const ENV_KEYS = ['AUTH_ENABLED', 'AUTH_KEY_CAPTIVE', 'NODE_ENV'] as const;
const savedEnv = new Map<string, string | undefined>();

function saveEnv(): void {
  for (const key of ENV_KEYS) {
    savedEnv.set(key, process.env[key]);
  }
}

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    const value = savedEnv.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function enableTestAuth(): void {
  process.env.AUTH_ENABLED = 'true';
  process.env.NODE_ENV = 'test';
  process.env.AUTH_KEY_CAPTIVE = 'test-captive-key';
}

function fakeQueueDb(): CoreDatabase {
  return {
    listQueue: () => [],
    getOpsSettings: () => ({
      rooms: [
        {
          roomId: 'labor',
          roomLabel: 'Labor',
          enabled: true,
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
    processExpiredRecallWindows: () => [],
    processExpiredRecallWindowForTicket: () => false,
    isCheckinLocked: () => false,
    isEffectiveCheckinLocked: () => false,
  } as unknown as CoreDatabase;
}

function waitingRoomPresence() {
  return listDevicePresence().find((entry) => entry.deviceId === WAITING_ROOM_DEVICE_ID);
}

async function waitForStreamDisconnected(timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (waitingRoomPresence()?.streamConnected === false) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

beforeEach(() => {
  saveEnv();
  resetDevicePresenceForTests();
});

afterEach(() => {
  restoreEnv();
  resetDevicePresenceForTests();
});

test('TV queue stream marks streamConnected only while the SSE connection is open', async () => {
  enableTestAuth();
  const app = Fastify({ logger: false });
  const sessions = createStaffSessionManager({ sessionTtlMs: 60 * 60 * 1000 });
  const { token } = sessions.createDeviceSession('tv', WAITING_ROOM_DEVICE_ID);
  const { token: staffToken } = sessions.createStaffSession('mfa');

  registerClientAuth(app, { staffSessions: sessions });
  registerQueueStreamRoutes(app, fakeQueueDb(), sessions);

  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  assert.equal(typeof address, 'object');
  assert.ok(address);
  const port = (address as AddressInfo).port;

  const response = await fetch(`http://127.0.0.1:${port}/api/v1/queue/stream`, {
    headers: {
      cookie: `${getStaffSessionCookieName()}=${staffToken}; ${getDeviceSessionCookieName('tv')}=${token}`,
      'x-client-role': 'tv',
    },
  });
  assert.equal(response.status, 200);
  assert.equal(waitingRoomPresence()?.streamConnected, true);
  assert.equal(waitingRoomPresence()?.status, 'online');

  await response.body?.cancel();
  await waitForStreamDisconnected();

  assert.equal(waitingRoomPresence()?.streamConnected, false);

  app.server.closeAllConnections();
  await app.close();
});

test('room-panel stream sends revocation and closes at absolute session expiry', async () => {
  enableTestAuth();
  const app = Fastify({ logger: false });
  const sessions = createStaffSessionManager({ sessionTtlMs: 80, sessionIdleTtlMs: 60_000 });
  const { token, session } = sessions.createRoomPanelSession({
    roomId: 'labor',
    placement: 'inside',
  });

  registerClientAuth(app, { staffSessions: sessions });
  registerQueueStreamRoutes(app, fakeQueueDb(), sessions);

  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  assert.equal(typeof address, 'object');
  assert.ok(address);
  const port = (address as AddressInfo).port;

  const response = await fetch(`http://127.0.0.1:${port}/api/v1/queue/stream`, {
    headers: {
      cookie: `${getRoomPanelSessionCookieName()}=${token}`,
      'x-client-role': 'room-panel',
    },
  });
  assert.equal(response.status, 200);

  const streamBody = await response.text();
  assert.match(streamBody, /event: snapshot/);
  assert.match(streamBody, /event: session-revoked/);
  assert.equal(sessions.refreshSession(session.sessionId), null);

  app.server.closeAllConnections();
  await app.close();
});
