import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';
import Fastify from 'fastify';
import { registerClientAuth } from '../../auth/client-auth.js';
import {
  createStaffSessionManager,
  getStaffSessionCookieName,
} from '../../auth/session-grants.js';
import type { CoreDatabase } from '../../shared/db/database.js';
import { createInMemoryDeviceGrantStore } from '../../shared/db/in-memory-device-grant-store.js';
import { registerOpsDeviceAuthorizationRoutes } from './ops-device-authorization-routes.js';

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

beforeEach(() => {
  saveEnv();
  process.env.AUTH_ENABLED = 'true';
  process.env.NODE_ENV = 'test';
  process.env.AUTH_KEY_CAPTIVE = 'test-captive-key';
});

afterEach(() => {
  restoreEnv();
});

test('MFA lists and revokes TV/terminal grants without token hashes', async () => {
  const app = Fastify({ logger: false });
  const sessions = createStaffSessionManager({ sessionTtlMs: 60 * 60 * 1000 });
  const deviceGrants = createInMemoryDeviceGrantStore();
  const issued = deviceGrants.issueDeviceCookie('tv', 'waiting-room');

  registerClientAuth(app, { staffSessions: sessions });
  registerOpsDeviceAuthorizationRoutes(app, deviceGrants as unknown as CoreDatabase);
  await app.ready();

  const { token } = sessions.createStaffSession('mfa');
  const headers = {
    cookie: `${getStaffSessionCookieName('mfa')}=${token}`,
    'x-client-role': 'mfa',
    host: 'praxis.test',
    origin: 'http://praxis.test',
  };

  const listed = await app.inject({
    method: 'GET',
    url: '/api/v1/ops/device-authorizations',
    headers,
  });
  assert.equal(listed.statusCode, 200);
  const body = listed.json() as {
    authorizations: Array<{ authorizationId: string; role: string; deviceId: string }>;
  };
  assert.equal(body.authorizations.length, 1);
  assert.equal(body.authorizations[0]?.role, 'tv');
  assert.equal(body.authorizations[0]?.deviceId, 'waiting-room');
  assert.equal('tokenHash' in (body.authorizations[0] ?? {}), false);

  const revoked = await app.inject({
    method: 'POST',
    url: `/api/v1/ops/device-authorizations/${body.authorizations[0]?.authorizationId}/revoke`,
    headers,
  });
  assert.equal(revoked.statusCode, 200);

  const after = await app.inject({
    method: 'GET',
    url: '/api/v1/ops/device-authorizations',
    headers,
  });
  assert.equal(after.json().authorizations.length, 0);
  assert.equal(deviceGrants.authenticateDeviceAuthorization(issued.token), null);

  const panel = deviceGrants.issueRoomPanelCookie('labor', 'outside');
  const listedPanels = await app.inject({
    method: 'GET',
    url: '/api/v1/ops/device-authorizations',
    headers,
  });
  assert.equal(listedPanels.statusCode, 200);
  const panelBody = listedPanels.json() as {
    authorizations: Array<{ role: string; roomId: string | null; placement: string | null }>;
  };
  assert.equal(panelBody.authorizations[0]?.role, 'room-panel');
  assert.equal(panelBody.authorizations[0]?.roomId, 'labor');
  assert.equal(panelBody.authorizations[0]?.placement, 'outside');

  const revokedPanel = await app.inject({
    method: 'POST',
    url: `/api/v1/ops/device-authorizations/${deviceGrants.authenticateDeviceAuthorization(panel.token)?.authorizationId}/revoke`,
    headers,
  });
  assert.equal(revokedPanel.statusCode, 200);

  await app.close();
});
