import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test, { afterEach, beforeEach } from 'node:test';
import Fastify from 'fastify';
import { registerClientAuth } from '../../auth/client-auth.js';
import { createStaffSessionManager, getStaffSessionCookieName } from '../../auth/session-grants.js';
import {
  listDevicePresence,
  resetDevicePresenceForTests,
  TERMINAL_DEVICE_ID,
} from '../../shared/ops/device-presence-registry.js';
import { createInMemoryDeviceGrantStore } from '../../shared/db/in-memory-device-grant-store.js';
import type { CoreDatabase } from '../../shared/db/database.js';
import { registerOpsDeviceStreamRoutes } from './ops-device-stream-routes.js';

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

function terminalPresence() {
  return listDevicePresence().find((entry) => entry.deviceId === TERMINAL_DEVICE_ID);
}

async function waitForStreamDisconnected(timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (terminalPresence()?.streamConnected === false) {
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

test('terminal device stream clears streamConnected but keeps fresh heartbeat online on disconnect', async () => {
  enableTestAuth();
  const app = Fastify({ logger: false });
  const sessions = createStaffSessionManager({ sessionTtlMs: 60 * 60 * 1000 });
  const deviceGrants = createInMemoryDeviceGrantStore();
  const issued = deviceGrants.issueDeviceCookie('terminal', TERMINAL_DEVICE_ID);
  const { token: staffToken } = sessions.createStaffSession('mfa');

  registerClientAuth(app, { staffSessions: sessions, deviceGrants });
  registerOpsDeviceStreamRoutes(app, {
    getDeviceAuthorizationById: (id: string) => deviceGrants.getDeviceAuthorizationById(id),
  } as CoreDatabase);

  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  assert.equal(typeof address, 'object');
  assert.ok(address);
  const port = (address as AddressInfo).port;

  const response = await fetch(`http://127.0.0.1:${port}/api/v1/ops/device/stream`, {
    headers: {
      cookie: `${getStaffSessionCookieName('mfa')}=${staffToken}; ${issued.cookieName}=${issued.token}`,
      'x-client-role': 'terminal',
    },
  });
  assert.equal(response.status, 200);
  assert.equal(terminalPresence()?.streamConnected, true);
  assert.equal(terminalPresence()?.status, 'online');

  await response.body?.cancel();
  await waitForStreamDisconnected(500);

  assert.equal(terminalPresence()?.streamConnected, false);
  assert.equal(terminalPresence()?.status, 'online');

  app.server.closeAllConnections();
  await app.close();
});
