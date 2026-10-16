import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import Fastify from 'fastify';
import { CoreDatabase } from '../shared/db/database.js';
import {
  createStaffSessionManager,
  hashStaffPinForConfig,
  type StaffRole,
} from '../auth/session-grants.js';
import { registerClientAuth } from '../auth/client-auth.js';
import { registerAuthRoutes } from './auth-routes.js';
import { registerQueueRoutes } from './queue-routes.js';
import { registerOpsSettingsRoutes } from './ops/ops-settings-routes.js';
import { registerOpsManagerMaintenanceRoutes } from './ops/ops-manager-maintenance-routes.js';

async function setup(t: test.TestContext) {
  const dir = mkdtempSync(join(tmpdir(), 'auth-restore-'));
  const env = {
    AUTH_ENABLED: 'true',
    AUTH_KEY_CAPTIVE: 'test-captive-key',
    NODE_ENV: 'test',
    BUSINESS_TZ: 'Europe/Berlin',
    CONTACT_LOOKUP_BASE_PATH: dir,
  };
  const saved = new Map(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  t.after(() => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(dir, { recursive: true, force: true });
  });
  const db = new CoreDatabase(join(dir, 'app.db'));
  db.updateAuthPinHash('mfa', hashStaffPinForConfig('2468'));
  db.updateAuthPinHash('ops', hashStaffPinForConfig('1357'));
  const sessions = createStaffSessionManager({ sessionTtlMs: 3600000 });
  const app = Fastify();
  registerClientAuth(app, { staffSessions: sessions, deviceGrants: db });
  registerAuthRoutes(app, sessions, db);
  registerQueueRoutes(app, db);
  registerOpsSettingsRoutes(app, db);
  const maintenance = Fastify();
  registerOpsManagerMaintenanceRoutes(maintenance, db, 'restore-test-token');
  t.after(async () => {
    await app.close();
    await maintenance.close();
  });
  const snapshot = db.exportSettingsSnapshot({
    BUSINESS_TZ: 'Europe/Berlin',
    SETUP_LAN_APP_IP: '192.168.1.50',
    CANONICAL_BASE_URL: 'http://192.168.1.50:8080',
  });
  async function login(role: StaffRole, pin = role === 'mfa' ? '2468' : '1357') {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { role, pin },
    });
    assert.equal(response.statusCode, 200);
    return {
      response,
      headers: {
        cookie: response.cookies.map((c) => `${c.name}=${c.value}`).join('; '),
        'x-client-role': role,
      },
    };
  }
  const restore = (payload: unknown) =>
    maintenance.inject({
      method: 'POST',
      url: '/api/v1/ops/settings/snapshot/import',
      headers: { authorization: 'Bearer restore-test-token' },
      payload,
    });
  return { app, db, sessions, snapshot, login, restore };
}

for (const role of ['mfa', 'ops'] as const) {
  test(`restoring ${role} default PIN revokes existing sessions and their stream subscriptions`, async (t) => {
    const { app, sessions, snapshot, login, restore } = await setup(t);
    const first = await login(role);
    const second = await login(role);
    const otherRole = role === 'mfa' ? 'ops' : 'mfa';
    const other = await login(otherRole);
    const revoked: string[] = [];
    for (const issued of [first, second, other]) {
      const id = issued.response.json().sessionId as string;
      sessions.subscribeSessionRevocation(id, () => {
        revoked.push(id);
      });
    }
    const protectedUrl = role === 'mfa' ? '/api/v1/queue' : '/api/v1/ops/settings';
    assert.equal((await app.inject({ url: protectedUrl, headers: first.headers })).statusCode, 200);
    snapshot.authSettings[role === 'mfa' ? 'staffPinHashMfa' : 'staffPinHashOps'] =
      hashStaffPinForConfig('0000');
    assert.equal((await restore(snapshot)).statusCode, 200);
    assert.equal(revoked.length, 2);
    for (const issued of [first, second]) {
      assert.equal(
        (await app.inject({ url: '/api/v1/auth/me', headers: issued.headers })).statusCode,
        401,
      );
      assert.equal(
        (await app.inject({ url: protectedUrl, headers: issued.headers })).statusCode,
        401,
      );
    }
    assert.equal(
      (await app.inject({ url: '/api/v1/auth/me', headers: other.headers })).statusCode,
      200,
    );
    const restricted = await login(role, '0000');
    assert.equal(restricted.response.json().pinChangeRequired, true);
    const denied = await app.inject({ url: protectedUrl, headers: restricted.headers });
    assert.equal(denied.statusCode, 403);
    assert.equal(denied.json().code, 'AUTH_PIN_CHANGE_REQUIRED');
  });
}

test('unchanged auth settings and failed imports do not revoke staff sessions', async (t) => {
  const { app, db, snapshot, login, restore } = await setup(t);
  const mfa = await login('mfa');
  const ops = await login('ops');
  assert.equal((await restore(snapshot)).statusCode, 200);
  const changed = {
    ...snapshot,
    authSettings: { ...snapshot.authSettings, staffPinHashMfa: hashStaffPinForConfig('0000') },
  };
  assert.throws(() =>
    db.importSettingsSnapshot(changed, {
      testHooks: {
        beforeCatalogSync: () => {
          throw new Error('rollback');
        },
      },
    }),
  );
  assert.equal((await restore({ ...changed, settingsFormatVersion: 99 })).statusCode, 400);
  for (const issued of [mfa, ops]) {
    const me = await app.inject({ url: '/api/v1/auth/me', headers: issued.headers });
    assert.equal(me.statusCode, 200);
    assert.equal(me.json().pinChangeRequired, false);
  }
});

test('restored custom PIN invalidates the old session without imposing default PIN setup', async (t) => {
  const { app, snapshot, login, restore } = await setup(t);
  const old = await login('mfa');
  snapshot.authSettings.staffPinHashMfa = hashStaffPinForConfig('9876');
  assert.equal((await restore(snapshot)).statusCode, 200);
  assert.equal(
    (await app.inject({ url: '/api/v1/auth/me', headers: old.headers })).statusCode,
    401,
  );
  const current = await login('mfa', '9876');
  assert.equal(current.response.json().pinChangeRequired, false);
  assert.equal(
    (await app.inject({ url: '/api/v1/queue', headers: current.headers })).statusCode,
    200,
  );
});
