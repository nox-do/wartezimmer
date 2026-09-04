import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test, { afterEach, beforeEach } from 'node:test';
import Fastify from 'fastify';
import { normalizeRoomPanelsSettings } from '@praxis-flow/domain';
import { registerClientAuth } from '../auth/client-auth.js';
import {
  getStaffSessionCookieName,
  createStaffSessionManager,
} from '../auth/session-grants.js';
import type { CoreDatabase } from '../shared/db/database.js';
import {
  listDevicePresence,
  resetDevicePresenceForTests,
  WAITING_ROOM_DEVICE_ID,
} from '../shared/ops/device-presence-registry.js';
import { createInMemoryDeviceGrantStore } from '../shared/db/in-memory-device-grant-store.js';
import { registerQueueStreamRoutes } from './queue-stream-routes.js';

const ENV_KEYS = ['AUTH_ENABLED', 'AUTH_KEY_CAPTIVE', 'NODE_ENV', 'PRAXIS_SSE_PING_MS'] as const;
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
    listActiveTerminalAssistPending: () => [],
    getOpsSettings: () => ({
      rooms: [
        {
          roomId: 'labor',
          roomLabel: 'Labor',
          enabled: true,
          panels: normalizeRoomPanelsSettings({
            inside: {
              enabled: true,
              mode: 'staff_full',
              showPatientNames: true,
              calledTextPreset: 'please_enter',
              calledTextCustom: null,
              arrivedTextPreset: 'please_wait_here',
              arrivedTextCustom: null,
            },
          }),
        },
      ],
    }),
    processExpiredRecallWindows: () => [],
    processExpiredRecallWindowForVisit: () => false,
    isCheckinLocked: () => false,
    isEffectiveCheckinLocked: () => false,
    getFlowCoreRuntimeInstance: () =>
      ({
        catalog: () => ({ surfaces: [], surfaceDisplayRules: [] }),
        visits: () => [],
      }) as unknown as ReturnType<
        import('../shared/flow-core/flow-core-runtime.js').getFlowCoreRuntime
      >,
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
  const deviceGrants = createInMemoryDeviceGrantStore();
  const issued = deviceGrants.issueDeviceCookie('tv', WAITING_ROOM_DEVICE_ID);
  const { token: staffToken } = sessions.createStaffSession('mfa');
  const db = {
    ...fakeQueueDb(),
    getDeviceAuthorizationById: (id: string) => deviceGrants.getDeviceAuthorizationById(id),
  } as CoreDatabase;

  registerClientAuth(app, { staffSessions: sessions, deviceGrants });
  registerQueueStreamRoutes(app, db, sessions);

  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  assert.equal(typeof address, 'object');
  assert.ok(address);
  const port = (address as AddressInfo).port;

  const response = await fetch(`http://127.0.0.1:${port}/api/v1/queue/stream`, {
    headers: {
      cookie: `${getStaffSessionCookieName('mfa')}=${staffToken}; ${issued.cookieName}=${issued.token}`,
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

test('room-panel stream stays open without staff session expiry', async () => {
  enableTestAuth();
  const app = Fastify({ logger: false });
  const sessions = createStaffSessionManager({ sessionTtlMs: 80, sessionIdleTtlMs: 60_000 });
  const deviceGrants = createInMemoryDeviceGrantStore();
  const issued = deviceGrants.issueRoomPanelCookie('labor', 'inside');
  const db = {
    ...fakeQueueDb(),
    getDeviceAuthorizationById: (id: string) => deviceGrants.getDeviceAuthorizationById(id),
    touchDeviceAuthorization: (id: string) => deviceGrants.touchDeviceAuthorization(id),
  } as CoreDatabase;

  registerClientAuth(app, { staffSessions: sessions, deviceGrants });
  registerQueueStreamRoutes(app, db, sessions);

  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  assert.equal(typeof address, 'object');
  assert.ok(address);
  const port = (address as AddressInfo).port;

  const response = await fetch(`http://127.0.0.1:${port}/api/v1/queue/stream`, {
    headers: {
      cookie: `${issued.cookieName}=${issued.token}`,
      'x-client-role': 'room-panel',
    },
  });
  assert.equal(response.status, 200);
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(response.bodyUsed, false);

  await response.body?.cancel();
  app.server.closeAllConnections();
  await app.close();
});

test('room-panel stream sends session-revoked on ping after grant revoke, then reconnect is 401', async () => {
  enableTestAuth();
  process.env.PRAXIS_SSE_PING_MS = '30';
  const app = Fastify({ logger: false });
  const sessions = createStaffSessionManager({ sessionTtlMs: 60 * 60 * 1000 });
  const deviceGrants = createInMemoryDeviceGrantStore();
  const issued = deviceGrants.issueRoomPanelCookie('labor', 'inside');
  const db = {
    ...fakeQueueDb(),
    getDeviceAuthorizationById: (id: string) => deviceGrants.getDeviceAuthorizationById(id),
    touchDeviceAuthorization: (id: string) => deviceGrants.touchDeviceAuthorization(id),
  } as CoreDatabase;

  registerClientAuth(app, { staffSessions: sessions, deviceGrants });
  registerQueueStreamRoutes(app, db, sessions);

  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  assert.equal(typeof address, 'object');
  assert.ok(address);
  const port = (address as AddressInfo).port;
  const streamUrl = `http://127.0.0.1:${port}/api/v1/queue/stream`;
  const headers = {
    cookie: `${issued.cookieName}=${issued.token}`,
    'x-client-role': 'room-panel',
  };

  const response = await fetch(streamUrl, { headers });
  assert.equal(response.status, 200);

  const grant = deviceGrants.authenticateDeviceAuthorization(issued.token);
  assert.ok(grant);
  deviceGrants.revokeDeviceAuthorizationById(grant.authorizationId);
  const streamBody = await response.text();
  assert.match(streamBody, /event: snapshot/);
  assert.match(streamBody, /event: session-revoked/);

  const reconnect = await fetch(streamUrl, { headers });
  assert.equal(reconnect.status, 401);
  await reconnect.body?.cancel();

  app.server.closeAllConnections();
  await app.close();
});
