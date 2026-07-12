import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';
import Fastify from 'fastify';
import { registerClientAuth } from './client-auth.js';
import {
  createStaffSessionManager,
  getDeviceSessionCookieName,
  getRoomPanelSessionCookieName,
  getStaffSessionCookieName,
  type StaffSessionManager,
} from './staff-session-auth.js';

const ENV_KEYS = [
  'AUTH_ENABLED',
  'AUTH_KEY_CAPTIVE',
  'NODE_ENV',
  'TV_LOCAL_ORIGIN',
  'TRUST_PROXY_HEADERS',
] as const;

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

async function buildProbeApp(): Promise<{
  app: ReturnType<typeof Fastify>;
  getHandlerCalled: () => boolean;
  sessions: StaffSessionManager;
}> {
  let handlerCalled = false;
  const app = Fastify({ logger: false });
  const sessions = createStaffSessionManager({ sessionTtlMs: 60 * 60 * 1000 });

  app.get('/api/v1/ops/deployment/storage', async () => {
    handlerCalled = true;
    return { probe: true };
  });
  app.get('/api/v1/queue', async (request) => ({ role: request.clientRole ?? null }));
  app.post('/api/v1/ops/device/presence', async () => ({ ok: true }));

  registerClientAuth(app, { staffSessions: sessions });
  await app.ready();

  return {
    app,
    getHandlerCalled: () => handlerCalled,
    sessions,
  };
}

function staffCookie(sessions: StaffSessionManager, role: 'mfa' | 'ops'): string {
  const { token } = sessions.createStaffSession(role);
  return `${getStaffSessionCookieName()}=${token}`;
}

function deviceCookie(sessions: StaffSessionManager, role: 'terminal' | 'tv'): string {
  const { token } = sessions.createDeviceSession(role, `test-${role}`);
  return `${getDeviceSessionCookieName(role)}=${token}`;
}

function roomPanelCookie(sessions: StaffSessionManager): string {
  const { token } = sessions.createRoomPanelSession({
    roomId: 'labor',
    placement: 'outside',
  });
  return `${getRoomPanelSessionCookieName()}=${token}`;
}

beforeEach(() => {
  saveEnv();
});

afterEach(() => {
  restoreEnv();
});

test('wrong role is rejected and route handler does not run', async () => {
  enableTestAuth();
  const { app, getHandlerCalled, sessions } = await buildProbeApp();

  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/ops/deployment/storage',
    headers: { cookie: deviceCookie(sessions, 'tv') },
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), { code: 'AUTH_FORBIDDEN', message: 'Forbidden.' });
  assert.equal(getHandlerCalled(), false);

  await app.close();
});

test('allowed role reaches route handler', async () => {
  enableTestAuth();
  const { app, getHandlerCalled, sessions } = await buildProbeApp();

  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/ops/deployment/storage',
    headers: { cookie: staffCookie(sessions, 'ops') },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { probe: true });
  assert.equal(getHandlerCalled(), true);

  await app.close();
});

test('room-panel session reaches queue but is denied ops routes', async () => {
  enableTestAuth();
  const { app, sessions } = await buildProbeApp();
  const cookie = roomPanelCookie(sessions);

  const queueResponse = await app.inject({
    method: 'GET',
    url: '/api/v1/queue',
    headers: { cookie, 'x-client-role': 'room-panel' },
  });
  assert.equal(queueResponse.statusCode, 200);
  assert.deepEqual(queueResponse.json(), { role: 'room-panel' });

  const opsResponse = await app.inject({
    method: 'GET',
    url: '/api/v1/ops/deployment/storage',
    headers: { cookie, 'x-client-role': 'room-panel' },
  });
  assert.equal(opsResponse.statusCode, 403);

  await app.close();
});

test('missing bearer token is rejected without running handler', async () => {
  enableTestAuth();
  const { app, getHandlerCalled } = await buildProbeApp();

  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/ops/deployment/storage',
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), { code: 'AUTH_UNAUTHORIZED', message: 'Unauthorized.' });
  assert.equal(getHandlerCalled(), false);

  await app.close();
});

test('production startup fails when AUTH_ENABLED is false', () => {
  process.env.NODE_ENV = 'production';
  process.env.AUTH_ENABLED = 'false';
  process.env.AUTH_KEY_CAPTIVE = 'test-captive-key-long-enough-for-production';

  const app = Fastify({ logger: false });
  assert.throws(() => registerClientAuth(app), /AUTH_DISABLED_IN_PRODUCTION/);
});

test('production startup fails when captive bearer is a weak default', () => {
  process.env.NODE_ENV = 'production';
  process.env.AUTH_ENABLED = 'true';
  process.env.AUTH_KEY_CAPTIVE = 'change-me-captive-key';

  const app = Fastify({ logger: false });
  assert.throws(() => registerClientAuth(app), /AUTH_CAPTIVE_KEY_WEAK_IN_PRODUCTION/);
});

test('registered route without ACL rule is rejected', async () => {
  enableTestAuth();
  let handlerCalled = false;
  const app = Fastify({ logger: false });

  app.get('/api/v1/test/unlisted-route', async () => {
    handlerCalled = true;
    return { probe: true };
  });

  registerClientAuth(app);
  await app.ready();

  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/test/unlisted-route',
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), { code: 'AUTH_FORBIDDEN', message: 'Forbidden.' });
  assert.equal(handlerCalled, false);

  await app.close();
});

test('captive bearer token is still accepted for captive routes', async () => {
  enableTestAuth();
  let handlerCalled = false;
  const app = Fastify({ logger: false });

  app.post('/api/v1/sessions/verify-ticket-code', async (request) => {
    handlerCalled = true;
    return { role: request.clientRole ?? null };
  });

  registerClientAuth(app);
  await app.ready();

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/sessions/verify-ticket-code',
    headers: { authorization: 'Bearer test-captive-key' },
    payload: { code: 'A-001' },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { role: 'captive' });
  assert.equal(handlerCalled, true);

  await app.close();
});

test('local TV origin grants read-only TV access only for explicit same-origin requests', async () => {
  enableTestAuth();
  process.env.TV_LOCAL_ORIGIN = 'http://localhost:8080';
  const { app } = await buildProbeApp();

  const allowed = await app.inject({
    method: 'GET',
    url: '/api/v1/queue',
    headers: {
      host: 'localhost:8080',
      'x-client-origin': 'http://localhost:8080',
    },
  });
  assert.equal(allowed.statusCode, 200);
  assert.deepEqual(allowed.json(), { role: 'tv' });

  const missingOrigin = await app.inject({
    method: 'GET',
    url: '/api/v1/queue',
    headers: { host: 'localhost:8080' },
  });
  assert.equal(missingOrigin.statusCode, 401);

  const foreignOrigin = await app.inject({
    method: 'GET',
    url: '/api/v1/queue',
    headers: {
      host: 'localhost:8080',
      'x-client-origin': 'http://other.local:8080',
    },
  });
  assert.equal(foreignOrigin.statusCode, 401);

  const mutation = await app.inject({
    method: 'POST',
    url: '/api/v1/ops/device/presence',
    headers: {
      host: 'localhost:8080',
      'x-client-origin': 'http://localhost:8080',
    },
    payload: {},
  });
  assert.equal(mutation.statusCode, 401);

  await app.close();
});

test('unsafe cookie requests do not trust spoofed forwarded host by default', async () => {
  enableTestAuth();
  const { app, sessions } = await buildProbeApp();

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/ops/device/presence',
    headers: {
      cookie: deviceCookie(sessions, 'terminal'),
      host: 'praxis.test',
      origin: 'http://evil.test',
      'x-forwarded-host': 'evil.test',
    },
    payload: {},
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), { code: 'AUTH_FORBIDDEN', message: 'Forbidden.' });

  await app.close();
});

test('staff sessions enforce idle timeout and absolute expiry', () => {
  const manager = createStaffSessionManager({ sessionTtlMs: 10_000, sessionIdleTtlMs: 1_000 });
  const now = new Date('2026-06-08T10:00:00.000Z');
  const { token } = manager.createStaffSession('mfa', now);

  assert.equal(manager.getSession(token, new Date(now.getTime() + 500))?.role, 'mfa');
  assert.equal(manager.getSession(token, new Date(now.getTime() + 1_400))?.role, 'mfa');
  assert.equal(manager.getSession(token, new Date(now.getTime() + 2_500)), null);

  const absoluteManager = createStaffSessionManager({
    sessionTtlMs: 10_000,
    sessionIdleTtlMs: 20_000,
  });
  const { token: absoluteToken } = absoluteManager.createStaffSession('ops', now);
  assert.equal(
    absoluteManager.getSession(absoluteToken, new Date(now.getTime() + 9_500))?.role,
    'ops',
  );
  assert.equal(absoluteManager.getSession(absoluteToken, new Date(now.getTime() + 10_001)), null);
});

test('an active stream can refresh idle expiry but not absolute session expiry', () => {
  const manager = createStaffSessionManager({ sessionTtlMs: 10_000, sessionIdleTtlMs: 1_000 });
  const now = new Date('2026-06-08T10:00:00.000Z');
  const { session } = manager.createRoomPanelSession({ roomId: 'labor', placement: 'inside' }, now);

  assert.equal(
    manager.refreshSession(session.sessionId, new Date(now.getTime() + 500))?.role,
    'room-panel',
  );
  assert.equal(
    manager.refreshSession(session.sessionId, new Date(now.getTime() + 1_400))?.role,
    'room-panel',
  );
  assert.equal(manager.refreshSession(session.sessionId, new Date(now.getTime() + 10_000)), null);
});

test('room-panel session operations can target placement without affecting outside panels', () => {
  const manager = createStaffSessionManager({ sessionTtlMs: 10_000 });
  const inside = manager.createRoomPanelSession({
    roomId: 'labor',
    placement: 'inside',
    clientKey: 'test-client',
  });
  const outside = manager.createRoomPanelSession({
    roomId: 'labor',
    placement: 'outside',
    clientKey: 'test-client',
  });

  assert.equal(manager.countRoomPanelSessions({ clientKey: 'test-client' }), 2);
  manager.revokeRoomPanelSessionsByPlacement('inside');

  assert.equal(manager.getSession(inside.token), null);
  assert.equal(manager.getSession(outside.token)?.sessionId, outside.session.sessionId);
  assert.equal(manager.countRoomPanelSessions({ clientKey: 'test-client' }), 1);
});

test('room-panel session revoke can target one room placement without affecting siblings', () => {
  const manager = createStaffSessionManager({ sessionTtlMs: 10_000 });
  const inside = manager.createRoomPanelSession({
    roomId: 'labor',
    placement: 'inside',
    clientKey: 'test-client',
  });
  const outside = manager.createRoomPanelSession({
    roomId: 'labor',
    placement: 'outside',
    clientKey: 'test-client',
  });

  manager.revokeRoomPanelSessionPlacement('labor', 'inside');

  assert.equal(manager.getSession(inside.token), null);
  assert.equal(manager.getSession(outside.token)?.sessionId, outside.session.sessionId);
});

test('session revocation notifies listeners and can preserve the current MFA session', () => {
  const manager = createStaffSessionManager({ sessionTtlMs: 10_000 });
  const current = manager.createStaffSession('mfa');
  const other = manager.createStaffSession('mfa');
  let revoked = false;
  manager.subscribeSessionRevocation(other.session.sessionId, () => {
    revoked = true;
  });

  manager.revokeSessionsByRole('mfa', current.session.sessionId);

  assert.equal(revoked, true);
  assert.equal(manager.getSession(current.token)?.sessionId, current.session.sessionId);
  assert.equal(manager.getSession(other.token), null);

  let lateSubscriberNotified = false;
  manager.subscribeSessionRevocation(other.session.sessionId, () => {
    lateSubscriberNotified = true;
  });
  assert.equal(lateSubscriberNotified, true);
});
