import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';
import Fastify from 'fastify';
import { DEFAULT_ROOM_PANELS_SETTINGS, normalizeRoomPanelsSettings } from '@praxis-flow/domain';
import { registerClientAuth } from '../auth/client-auth.js';
import {
  createStaffSessionManager,
  getAuthSettingsSeedConfig,
  hashStaffPinForConfig,
} from '../auth/staff-session-auth.js';
import { DEFAULT_STAFF_PIN_HASH } from '../auth/staff-pin-auth.js';
import { resetDevicePairingForTests } from '../shared/ops/device-pairing-registry.js';
import {
  listDevicePresence,
  resetDevicePresenceForTests,
} from '../shared/ops/device-presence-registry.js';
import { registerAuthRoutes } from './auth-routes.js';
import { registerOpsDeviceRoutes } from './ops/ops-device-routes.js';
import type { AuthPinTarget, AuthSettings } from '../shared/db/database-auth-settings.js';

const ENV_KEYS = [
  'AUTH_ENABLED',
  'AUTH_KEY_CAPTIVE',
  'NODE_ENV',
  'STAFF_SESSION_TTL_MS',
  'ROOM_PANEL_OUTSIDE_SESSION_MAX_PER_CLIENT',
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
  process.env.STAFF_SESSION_TTL_MS = '3600000';
}

const TEST_ROOM_PANEL_PIN_HASH = hashStaffPinForConfig('2222');

function readSetCookie(response: {
  headers: Record<string, string | string[] | undefined>;
}): string {
  const raw = response.headers['set-cookie'];
  if (Array.isArray(raw)) {
    return raw[0] ?? '';
  }
  return raw ?? '';
}

function sameOriginCookieHeaders(cookie: string): Record<string, string> {
  return {
    cookie,
    host: 'praxis.test',
    origin: 'http://praxis.test',
  };
}

function buildAuthSettingsStub(): {
  getAuthSettings(): AuthSettings;
  updateAuthPinHash(target: AuthPinTarget, pinHash: string): AuthSettings;
} {
  let authSettings: AuthSettings = {
    staffPinHashMfa: hashStaffPinForConfig('0000'),
    staffPinHashOps: hashStaffPinForConfig('1111'),
    roomPanelPinHash: TEST_ROOM_PANEL_PIN_HASH,
    updatedAt: new Date().toISOString(),
  };
  return {
    getAuthSettings: () => authSettings,
    updateAuthPinHash: (target: AuthPinTarget, pinHash: string) => {
      authSettings = {
        ...authSettings,
        ...(target === 'mfa'
          ? { staffPinHashMfa: pinHash }
          : target === 'ops'
            ? { staffPinHashOps: pinHash }
            : { roomPanelPinHash: pinHash }),
        updatedAt: new Date().toISOString(),
      };
      return authSettings;
    },
  };
}

async function buildAuthApp(): Promise<ReturnType<typeof Fastify>> {
  const app = Fastify({ logger: false });
  const sessions = createStaffSessionManager({ sessionTtlMs: 60 * 60 * 1000 });
  const db = {
    ...buildAuthSettingsStub(),
    getOpsSettings: () => ({
      rooms: [
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
            inside: {
              enabled: true,
              mode: 'staff_full',
              showPatientNames: false,
              allowCalling: false,
              calledTextPreset: 'please_enter',
              calledTextCustom: null,
              arrivedTextPreset: 'please_wait_here',
              arrivedTextCustom: null,
            },
          }),
        },
        {
          roomId: 'korridor',
          roomLabel: 'Korridor',
          enabled: true,
          defaultCallTarget: false,
          maxOccupancy: null,
          panels: normalizeRoomPanelsSettings({
            outside: {
              enabled: true,
              mode: 'display_only',
              showPatientNames: false,
              calledTextPreset: 'please_enter',
              calledTextCustom: null,
              arrivedTextPreset: 'please_wait_here',
              arrivedTextCustom: null,
            },
          }),
        },
        {
          roomId: 'rezeption',
          roomLabel: 'Rezeption',
          enabled: true,
          defaultCallTarget: false,
          maxOccupancy: null,
          panels: normalizeRoomPanelsSettings({
            inside: {
              enabled: true,
              mode: 'display_only',
              showPatientNames: true,
              calledTextPreset: 'please_enter',
              calledTextCustom: null,
              arrivedTextPreset: 'please_wait_here',
              arrivedTextCustom: null,
            },
          }),
        },
        {
          roomId: 'archiv',
          roomLabel: 'Archiv',
          enabled: true,
          defaultCallTarget: false,
          maxOccupancy: null,
          panels: DEFAULT_ROOM_PANELS_SETTINGS,
        },
      ],
    }),
  };

  registerClientAuth(app, { staffSessions: sessions });
  registerAuthRoutes(app, sessions, db);
  registerOpsDeviceRoutes(app);
  app.get('/api/v1/ops/deployment/storage', async (request) => ({
    role: request.clientRole ?? null,
  }));
  app.get('/api/v1/queue', async (request) => ({ role: request.clientRole ?? null }));
  app.post('/api/v1/queue/:visitId/transition', async () => ({ transitioned: true }));
  app.get('/api/v1/checkins/topics', async (request) => ({
    role: request.clientRole ?? null,
    topics: [],
  }));
  app.post('/api/v1/checkins', async (request, reply) =>
    reply.code(201).send({ role: request.clientRole ?? null, visitId: 'ticket-1' }),
  );
  await app.ready();
  return app;
}

async function loginMfa(app: ReturnType<typeof Fastify>): Promise<string> {
  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { pin: '0000', role: 'mfa' },
  });
  assert.equal(login.statusCode, 200);
  return readSetCookie(login);
}

async function loginOps(app: ReturnType<typeof Fastify>, pin = '1111'): Promise<string> {
  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { pin, role: 'ops' },
  });
  assert.equal(login.statusCode, 200);
  return readSetCookie(login);
}

async function pairDeviceSession(
  app: ReturnType<typeof Fastify>,
  input: { kind: 'tv' | 'terminal'; displayId: string; mfaCookie: string },
): Promise<string> {
  const start = await app.inject({
    method: 'POST',
    url: `/api/v1/auth/${input.kind}/pairing/start`,
    payload: { displayId: input.displayId },
  });
  assert.equal(start.statusCode, 200);

  const started = start.json() as { pairingId: string; code: string };
  const confirm = await app.inject({
    method: 'POST',
    url: `/api/v1/auth/${input.kind}/pairing/confirm`,
    headers: sameOriginCookieHeaders(input.mfaCookie),
    payload: { code: started.code },
  });
  assert.equal(confirm.statusCode, 200);

  const paired = await app.inject({
    method: 'GET',
    url: `/api/v1/auth/${input.kind}/pairing/${started.pairingId}`,
  });
  assert.equal(paired.statusCode, 200);
  return readSetCookie(paired);
}

beforeEach(() => {
  saveEnv();
});

test('room-panel rooms endpoint lists only enabled panel rooms', async () => {
  enableTestAuth();
  const app = await buildAuthApp();

  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/auth/room-panel/rooms',
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    rooms: [
      {
        roomId: 'labor',
        roomLabel: 'Labor',
        placement: 'outside',
        mode: 'arrival',
        requiresPin: false,
      },
      {
        roomId: 'labor',
        roomLabel: 'Labor',
        placement: 'inside',
        mode: 'staff_full',
        requiresPin: true,
      },
      {
        roomId: 'korridor',
        roomLabel: 'Korridor',
        placement: 'outside',
        mode: 'display_only',
        requiresPin: false,
      },
      {
        roomId: 'rezeption',
        roomLabel: 'Rezeption',
        placement: 'inside',
        mode: 'display_only',
        requiresPin: true,
      },
    ],
  });

  await app.close();
});

test('room-panel login creates scoped room-panel session cookie', async () => {
  enableTestAuth();
  const app = await buildAuthApp();

  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/room-panel/login',
    payload: { roomId: 'labor', placement: 'outside', pin: '2222' },
  });

  assert.equal(login.statusCode, 200);
  assert.match(readSetCookie(login), /pf_room_panel_session=/);
  assert.deepEqual(
    {
      ok: login.json().ok,
      role: login.json().role,
      roomId: login.json().roomId,
      placement: login.json().placement,
    },
    { ok: true, role: 'room-panel', roomId: 'labor', placement: 'outside' },
  );

  const queue = await app.inject({
    method: 'GET',
    url: '/api/v1/queue',
    headers: { cookie: readSetCookie(login), 'x-client-role': 'room-panel' },
  });
  assert.equal(queue.statusCode, 200);
  assert.deepEqual(queue.json(), { role: 'room-panel' });

  await app.close();
});

test('room-panel login resolves placement when outside and inside are both enabled', async () => {
  enableTestAuth();
  const app = await buildAuthApp();

  const outsideLogin = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/room-panel/login',
    payload: { roomId: 'labor', placement: 'outside', pin: '' },
  });
  assert.equal(outsideLogin.statusCode, 200);
  assert.equal(outsideLogin.json().placement, 'outside');

  const insideLogin = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/room-panel/login',
    payload: { roomId: 'labor', placement: 'inside', pin: '2222' },
  });
  assert.equal(insideLogin.statusCode, 200);
  assert.equal(insideLogin.json().placement, 'inside');

  const missingPlacement = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/room-panel/login',
    payload: { roomId: 'labor', pin: '' },
  });
  assert.equal(missingPlacement.statusCode, 400);

  await app.close();
});

test('multiple room-panel sessions can use the same room profile', async () => {
  enableTestAuth();
  const app = await buildAuthApp();

  const firstLogin = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/room-panel/login',
    payload: { roomId: 'labor', placement: 'outside', pin: '' },
  });
  const firstCookie = readSetCookie(firstLogin);

  const secondLogin = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/room-panel/login',
    payload: { roomId: 'labor', placement: 'outside', pin: '' },
  });
  assert.equal(secondLogin.statusCode, 200);

  const firstSession = await app.inject({
    method: 'GET',
    url: '/api/v1/queue',
    headers: { cookie: firstCookie, 'x-client-role': 'room-panel' },
  });
  assert.equal(firstSession.statusCode, 200);

  await app.close();
});

test('outside room-panel sessions are capped per client without blocking PIN login', async () => {
  enableTestAuth();
  process.env.ROOM_PANEL_OUTSIDE_SESSION_MAX_PER_CLIENT = '2';
  const app = await buildAuthApp();

  for (let index = 0; index < 2; index += 1) {
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/room-panel/login',
      payload: { roomId: 'labor', placement: 'outside', pin: '' },
    });
    assert.equal(login.statusCode, 200);
  }

  const capped = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/room-panel/login',
    payload: { roomId: 'labor', placement: 'outside', pin: '' },
  });
  assert.equal(capped.statusCode, 429);

  const protectedLogin = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/room-panel/login',
    payload: { roomId: 'rezeption', placement: 'inside', pin: '2222' },
  });
  assert.equal(protectedLogin.statusCode, 200);

  await app.close();
});

test('room-panel login allows empty pin for display_only without patient names', async () => {
  enableTestAuth();
  const app = await buildAuthApp();

  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/room-panel/login',
    payload: { roomId: 'korridor', placement: 'outside', pin: '' },
  });

  assert.equal(login.statusCode, 200);
  assert.deepEqual(
    {
      ok: login.json().ok,
      role: login.json().role,
      roomId: login.json().roomId,
      placement: login.json().placement,
    },
    { ok: true, role: 'room-panel', roomId: 'korridor', placement: 'outside' },
  );

  await app.close();
});

test('room-panel login allows outside interaction and requires pin inside', async () => {
  enableTestAuth();
  const app = await buildAuthApp();

  const patientArrival = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/room-panel/login',
    payload: { roomId: 'labor', placement: 'outside', pin: '' },
  });
  assert.equal(patientArrival.statusCode, 200);

  const namedDisplay = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/room-panel/login',
    payload: { roomId: 'rezeption', placement: 'inside', pin: '' },
  });
  assert.equal(namedDisplay.statusCode, 401);

  await app.close();
});

test('room-panel login rejects placement that is not enabled for the room', async () => {
  enableTestAuth();
  const app = await buildAuthApp();

  const insideOnOutsideOnlyRoom = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/room-panel/login',
    payload: { roomId: 'korridor', placement: 'inside', pin: '2222' },
  });
  assert.equal(insideOnOutsideOnlyRoom.statusCode, 404);

  const outsideOnInsideOnlyRoom = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/room-panel/login',
    payload: { roomId: 'rezeption', placement: 'outside', pin: '' },
  });
  assert.equal(outsideOnInsideOnlyRoom.statusCode, 404);

  await app.close();
});

test('room-panel login rejects wrong pin and disabled panel room', async () => {
  enableTestAuth();
  const app = await buildAuthApp();

  const wrongPin = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/room-panel/login',
    payload: { roomId: 'rezeption', placement: 'inside', pin: '0000' },
  });
  assert.equal(wrongPin.statusCode, 401);

  const disabledRoom = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/room-panel/login',
    payload: { roomId: 'archiv', placement: 'outside', pin: '2222' },
  });
  assert.equal(disabledRoom.statusCode, 404);

  await app.close();
});

test('MFA can rotate own PIN after entering current MFA PIN', async () => {
  enableTestAuth();
  const app = await buildAuthApp();
  const cookie = await loginMfa(app);

  const change = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/pin/change',
    headers: sameOriginCookieHeaders(cookie),
    payload: { currentPin: '0000', target: 'mfa', newPin: '3333' },
  });
  assert.equal(change.statusCode, 200);
  assert.equal(change.json().ok, true);
  assert.equal(change.json().target, 'mfa');
  assert.equal(typeof change.json().updatedAt, 'string');

  const oldLogin = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { pin: '0000', role: 'mfa' },
  });
  assert.equal(oldLogin.statusCode, 401);

  const newLogin = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { pin: '3333', role: 'mfa' },
  });
  assert.equal(newLogin.statusCode, 200);

  await app.close();
});

test('MFA PIN rotation revokes other MFA sessions but preserves the current session', async () => {
  enableTestAuth();
  const app = await buildAuthApp();
  const currentCookie = await loginMfa(app);
  const otherCookie = await loginMfa(app);

  const change = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/pin/change',
    headers: sameOriginCookieHeaders(currentCookie),
    payload: { currentPin: '0000', target: 'mfa', newPin: '3333' },
  });
  assert.equal(change.statusCode, 200);

  const currentSession = await app.inject({
    method: 'GET',
    url: '/api/v1/auth/me',
    headers: { cookie: currentCookie },
  });
  assert.equal(currentSession.statusCode, 200);

  const otherSession = await app.inject({
    method: 'GET',
    url: '/api/v1/auth/me',
    headers: { cookie: otherCookie },
  });
  assert.equal(otherSession.statusCode, 401);

  await app.close();
});

test('MFA PIN rotation rejects the current Ops PIN', async () => {
  enableTestAuth();
  const app = await buildAuthApp();
  const cookie = await loginMfa(app);

  const change = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/pin/change',
    headers: sameOriginCookieHeaders(cookie),
    payload: { currentPin: '0000', target: 'mfa', newPin: '1111' },
  });
  assert.equal(change.statusCode, 400);
  assert.equal(change.json().code, 'INVALID_ARGUMENT');

  const oldLogin = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { pin: '0000', role: 'mfa' },
  });
  assert.equal(oldLogin.statusCode, 200);

  await app.close();
});

test('MFA cannot rotate Ops PIN', async () => {
  enableTestAuth();
  const app = await buildAuthApp();
  const cookie = await loginMfa(app);

  const change = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/pin/change',
    headers: sameOriginCookieHeaders(cookie),
    payload: { currentPin: '0000', target: 'ops', newPin: '5555' },
  });
  assert.equal(change.statusCode, 403);
  assert.equal(change.json().code, 'AUTH_FORBIDDEN');

  await app.close();
});

test('Ops can rotate Ops PIN after entering current Ops PIN', async () => {
  enableTestAuth();
  const app = await buildAuthApp();
  const cookie = await loginOps(app);

  const change = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/pin/change',
    headers: sameOriginCookieHeaders(cookie),
    payload: { currentPin: '1111', target: 'ops', newPin: '5555' },
  });
  assert.equal(change.statusCode, 200);
  assert.equal(change.json().target, 'ops');

  const oldLogin = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { pin: '1111', role: 'ops' },
  });
  assert.equal(oldLogin.statusCode, 401);

  const newLogin = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { pin: '5555', role: 'ops' },
  });
  assert.equal(newLogin.statusCode, 200);

  await app.close();
});

test('Ops PIN rotation rejects the current MFA PIN as new Ops PIN', async () => {
  enableTestAuth();
  const app = await buildAuthApp();
  const cookie = await loginOps(app);

  const change = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/pin/change',
    headers: sameOriginCookieHeaders(cookie),
    payload: { currentPin: '1111', target: 'ops', newPin: '0000' },
  });
  assert.equal(change.statusCode, 400);
  assert.equal(change.json().code, 'INVALID_ARGUMENT');

  await app.close();
});

test('MFA can rotate shared room panel PIN after entering current MFA PIN', async () => {
  enableTestAuth();
  const app = await buildAuthApp();
  const cookie = await loginMfa(app);
  const existingPanelLogin = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/room-panel/login',
    payload: { roomId: 'rezeption', placement: 'inside', pin: '2222' },
  });
  assert.equal(existingPanelLogin.statusCode, 200);
  const existingPanelCookie = readSetCookie(existingPanelLogin);
  const outsidePanelLogin = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/room-panel/login',
    payload: { roomId: 'labor', placement: 'outside', pin: '' },
  });
  assert.equal(outsidePanelLogin.statusCode, 200);
  const outsidePanelCookie = readSetCookie(outsidePanelLogin);

  const change = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/pin/change',
    headers: sameOriginCookieHeaders(cookie),
    payload: { currentPin: '0000', target: 'room-panel', newPin: '4444' },
  });
  assert.equal(change.statusCode, 200);
  assert.equal(change.json().target, 'room-panel');

  const oldLogin = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/room-panel/login',
    payload: { roomId: 'rezeption', placement: 'inside', pin: '2222' },
  });
  assert.equal(oldLogin.statusCode, 401);

  const newLogin = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/room-panel/login',
    payload: { roomId: 'rezeption', placement: 'inside', pin: '4444' },
  });
  assert.equal(newLogin.statusCode, 200);

  const revokedPanelSession = await app.inject({
    method: 'GET',
    url: '/api/v1/queue',
    headers: { cookie: existingPanelCookie, 'x-client-role': 'room-panel' },
  });
  assert.equal(revokedPanelSession.statusCode, 401);

  const preservedOutsidePanelSession = await app.inject({
    method: 'GET',
    url: '/api/v1/queue',
    headers: { cookie: outsidePanelCookie, 'x-client-role': 'room-panel' },
  });
  assert.equal(preservedOutsidePanelSession.statusCode, 200);

  await app.close();
});

test('PIN rotation rejects wrong current MFA PIN', async () => {
  enableTestAuth();
  const app = await buildAuthApp();
  const cookie = await loginMfa(app);

  const change = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/pin/change',
    headers: sameOriginCookieHeaders(cookie),
    payload: { currentPin: '9999', target: 'room-panel', newPin: '4444' },
  });
  assert.equal(change.statusCode, 401);

  const panelLogin = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/room-panel/login',
    payload: { roomId: 'labor', placement: 'outside', pin: '2222' },
  });
  assert.equal(panelLogin.statusCode, 200);

  await app.close();
});

test('PIN rotation treats SQL metacharacter current PIN as wrong credentials', async () => {
  enableTestAuth();
  const app = await buildAuthApp();
  const cookie = await loginMfa(app);

  const injectedCurrentPin = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/pin/change',
    headers: sameOriginCookieHeaders(cookie),
    payload: { currentPin: "0000' OR '1'='1", target: 'mfa', newPin: '3333' },
  });
  assert.equal(injectedCurrentPin.statusCode, 401);

  const unchangedLogin = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { pin: '0000', role: 'mfa' },
  });
  assert.equal(unchangedLogin.statusCode, 200);

  await app.close();
});

test('PIN rotation is rate limited per MFA session and client', async () => {
  enableTestAuth();
  const app = await buildAuthApp();
  const cookie = await loginMfa(app);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/pin/change',
      headers: sameOriginCookieHeaders(cookie),
      payload: { currentPin: '9999', target: 'room-panel', newPin: '4444' },
    });
    assert.equal(response.statusCode, 401);
  }

  const limited = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/pin/change',
    headers: sameOriginCookieHeaders(cookie),
    payload: { currentPin: '9999', target: 'room-panel', newPin: '4444' },
  });
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.json().code, 'RATE_LIMITED');

  await app.close();
});

afterEach(() => {
  restoreEnv();
  resetDevicePairingForTests();
  resetDevicePresenceForTests();
});

test('staff login creates a cookie session that authenticates /auth/me', async () => {
  enableTestAuth();
  const app = await buildAuthApp();

  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { pin: '1111', role: 'ops' },
  });

  assert.equal(login.statusCode, 200);
  assert.equal(login.json().ok, true);
  assert.equal(login.json().role, 'ops');
  const cookie = readSetCookie(login);
  assert.match(cookie, /pf_staff_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);

  const me = await app.inject({
    method: 'GET',
    url: '/api/v1/auth/me',
    headers: { cookie },
  });

  assert.equal(me.statusCode, 200);
  assert.equal(me.json().ok, true);
  assert.equal(me.json().role, 'ops');

  const protectedRoute = await app.inject({
    method: 'GET',
    url: '/api/v1/ops/deployment/storage',
    headers: { cookie },
  });

  assert.equal(protectedRoute.statusCode, 200);
  assert.deepEqual(protectedRoute.json(), { role: 'ops' });

  await app.close();
});

test('MFA PIN cannot create an ops staff session', async () => {
  enableTestAuth();
  const app = await buildAuthApp();

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { pin: '0000', role: 'ops' },
  });

  assert.equal(response.statusCode, 401);
  assert.equal(readSetCookie(response), '');

  await app.close();
});

test('wrong staff PIN is rejected without setting a session cookie', async () => {
  enableTestAuth();
  const app = await buildAuthApp();

  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { pin: '9999', role: 'mfa' },
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), { code: 'AUTH_UNAUTHORIZED', message: 'Unauthorized.' });
  assert.equal(readSetCookie(response), '');

  await app.close();
});

test('staff login treats SQL metacharacter PIN payloads as plain wrong credentials', async () => {
  enableTestAuth();
  const app = await buildAuthApp();

  for (const payload of ["0000' OR '1'='1", "1111'; DROP TABLE auth_settings; --"]) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { pin: payload, role: 'ops' },
    });

    assert.equal(response.statusCode, 401);
    assert.equal(readSetCookie(response), '');
  }

  const validLogin = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { pin: '1111', role: 'ops' },
  });
  assert.equal(validLogin.statusCode, 200);

  await app.close();
});

test('room-panel login treats SQL metacharacter fields as data', async () => {
  enableTestAuth();
  const app = await buildAuthApp();

  const injectedRoom = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/room-panel/login',
    payload: { roomId: "rezeption' OR '1'='1", placement: 'inside', pin: '2222' },
  });
  assert.equal(injectedRoom.statusCode, 404);

  const injectedPin = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/room-panel/login',
    payload: { roomId: 'rezeption', placement: 'inside', pin: "2222' OR '1'='1" },
  });
  assert.equal(injectedPin.statusCode, 401);

  const validLogin = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/room-panel/login',
    payload: { roomId: 'rezeption', placement: 'inside', pin: '2222' },
  });
  assert.equal(validLogin.statusCode, 200);

  await app.close();
});

test('logout revokes staff session cookie', async () => {
  enableTestAuth();
  const app = await buildAuthApp();

  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { pin: '0000', role: 'mfa' },
  });
  const cookie = readSetCookie(login);

  const logout = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/logout',
    headers: sameOriginCookieHeaders(cookie),
  });

  assert.equal(logout.statusCode, 200);
  assert.deepEqual(logout.json(), { ok: true });
  assert.match(readSetCookie(logout), /Max-Age=0/);

  const me = await app.inject({
    method: 'GET',
    url: '/api/v1/auth/me',
    headers: { cookie },
  });

  assert.equal(me.statusCode, 401);
  assert.deepEqual(me.json(), { code: 'AUTH_UNAUTHORIZED', message: 'Unauthorized.' });

  await app.close();
});

test('staff cookie mutations require same-origin request headers', async () => {
  enableTestAuth();
  const app = await buildAuthApp();

  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { pin: '0000', role: 'mfa' },
  });
  const cookie = readSetCookie(login);

  const missingOrigin = await app.inject({
    method: 'POST',
    url: '/api/v1/queue/A-001/transition',
    headers: { cookie },
    payload: {},
  });
  assert.equal(missingOrigin.statusCode, 403);

  const foreignOrigin = await app.inject({
    method: 'POST',
    url: '/api/v1/queue/A-001/transition',
    headers: {
      cookie,
      host: 'praxis.test',
      origin: 'http://evil.test',
    },
    payload: {},
  });
  assert.equal(foreignOrigin.statusCode, 403);

  const devUiOrigin = await app.inject({
    method: 'POST',
    url: '/api/v1/queue/A-001/transition',
    headers: {
      cookie,
      host: 'localhost:8080',
      origin: 'http://localhost:5180',
    },
    payload: { type: 'call' },
  });
  assert.equal(devUiOrigin.statusCode, 200);

  await app.close();
});

test('production startup accepts default staff PIN seed', () => {
  process.env.NODE_ENV = 'production';
  process.env.AUTH_ENABLED = 'true';
  process.env.AUTH_KEY_CAPTIVE = 'test-captive-key-long-enough-for-production';

  const app = Fastify({ logger: false });
  const sessions = createStaffSessionManager({ sessionTtlMs: 60 * 60 * 1000 });
  assert.doesNotThrow(() =>
    registerAuthRoutes(app, sessions, {
      ...buildAuthSettingsStub(),
      getOpsSettings: () => ({ rooms: [] }),
    }),
  );
});

test('auth settings seed config uses built-in default hashes', () => {
  const seed = getAuthSettingsSeedConfig();
  assert.equal(seed.pinHashesByRole.mfa, DEFAULT_STAFF_PIN_HASH);
  assert.equal(seed.pinHashesByRole.ops, DEFAULT_STAFF_PIN_HASH);
  assert.equal(seed.roomPanelPinHash, DEFAULT_STAFF_PIN_HASH);
});

test('TV pairing code creates read-only TV device session on polling TV browser', async () => {
  enableTestAuth();
  const app = await buildAuthApp();

  const start = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/tv/pairing/start',
    payload: { displayId: 'waiting-room' },
  });

  assert.equal(start.statusCode, 200);
  const started = start.json() as { pairingId: string; code: string; status: string };
  assert.equal(started.status, 'pending');
  assert.match(started.code, /^[0-9]{4}$/);

  const pending = await app.inject({
    method: 'GET',
    url: `/api/v1/auth/tv/pairing/${started.pairingId}`,
  });
  assert.equal(pending.statusCode, 200);
  assert.deepEqual(
    { status: pending.json().status, paired: pending.json().paired },
    { status: 'pending', paired: false },
  );
  assert.equal(readSetCookie(pending), '');

  const mfaCookie = await loginMfa(app);

  const confirm = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/tv/pairing/confirm',
    headers: sameOriginCookieHeaders(mfaCookie),
    payload: { code: started.code },
  });
  assert.equal(confirm.statusCode, 200);
  assert.deepEqual(confirm.json(), { ok: true, pairingId: started.pairingId, status: 'paired' });

  const paired = await app.inject({
    method: 'GET',
    url: `/api/v1/auth/tv/pairing/${started.pairingId}`,
  });
  assert.equal(paired.statusCode, 200);
  assert.equal(paired.json().status, 'paired');
  assert.equal(paired.json().paired, true);
  const tvCookie = readSetCookie(paired);
  assert.match(tvCookie, /pf_tv_device_session=/);
  assert.match(tvCookie, /HttpOnly/);
  assert.match(tvCookie, /SameSite=Strict/);

  const queue = await app.inject({
    method: 'GET',
    url: '/api/v1/queue',
    headers: { cookie: tvCookie },
  });
  assert.equal(queue.statusCode, 200);
  assert.deepEqual(queue.json(), { role: 'tv' });

  const mutation = await app.inject({
    method: 'POST',
    url: '/api/v1/queue/A-001/transition',
    headers: { cookie: tvCookie },
    payload: { type: 'call' },
  });
  assert.equal(mutation.statusCode, 403);

  await app.close();
});

test('terminal pairing code creates terminal device session for check-in routes', async () => {
  enableTestAuth();
  const app = await buildAuthApp();

  const start = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/terminal/pairing/start',
    payload: { displayId: 'checkin-terminal' },
  });

  assert.equal(start.statusCode, 200);
  const started = start.json() as { pairingId: string; code: string; status: string };
  assert.equal(started.status, 'pending');
  assert.match(started.code, /^[0-9]{4}$/);

  const mfaCookie = await loginMfa(app);

  const confirm = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/terminal/pairing/confirm',
    headers: sameOriginCookieHeaders(mfaCookie),
    payload: { code: started.code },
  });
  assert.equal(confirm.statusCode, 200);
  assert.deepEqual(confirm.json(), { ok: true, pairingId: started.pairingId, status: 'paired' });

  const paired = await app.inject({
    method: 'GET',
    url: `/api/v1/auth/terminal/pairing/${started.pairingId}`,
  });
  assert.equal(paired.statusCode, 200);
  const terminalCookie = readSetCookie(paired);
  assert.match(terminalCookie, /pf_terminal_device_session=/);

  const topics = await app.inject({
    method: 'GET',
    url: '/api/v1/checkins/topics',
    headers: { cookie: terminalCookie },
  });
  assert.equal(topics.statusCode, 200);
  assert.equal(topics.json().role, 'terminal');

  const checkin = await app.inject({
    method: 'POST',
    url: '/api/v1/checkins',
    headers: sameOriginCookieHeaders(terminalCookie),
    payload: { topicId: 'general', authPath: 'phone_dob' },
  });
  assert.equal(checkin.statusCode, 201);
  assert.equal(checkin.json().role, 'terminal');

  const mfaOnly = await app.inject({
    method: 'POST',
    url: '/api/v1/queue/A-001/transition',
    headers: { cookie: terminalCookie },
    payload: { type: 'call' },
  });
  assert.equal(mfaOnly.statusCode, 403);

  await app.close();
});

test('re-pairing a device revokes older sessions for the same device', async () => {
  enableTestAuth();
  const app = await buildAuthApp();
  const mfaCookie = await loginMfa(app);
  const oldTerminalCookie = await pairDeviceSession(app, {
    kind: 'terminal',
    displayId: 'checkin-terminal',
    mfaCookie,
  });

  const oldTopics = await app.inject({
    method: 'GET',
    url: '/api/v1/checkins/topics',
    headers: { cookie: oldTerminalCookie },
  });
  assert.equal(oldTopics.statusCode, 200);

  const newTerminalCookie = await pairDeviceSession(app, {
    kind: 'terminal',
    displayId: 'checkin-terminal',
    mfaCookie,
  });

  const revokedTopics = await app.inject({
    method: 'GET',
    url: '/api/v1/checkins/topics',
    headers: { cookie: oldTerminalCookie },
  });
  assert.equal(revokedTopics.statusCode, 401);

  const newTopics = await app.inject({
    method: 'GET',
    url: '/api/v1/checkins/topics',
    headers: { cookie: newTerminalCookie },
  });
  assert.equal(newTopics.statusCode, 200);

  await app.close();
});

test('terminal device role can be selected when staff and device cookies share one browser', async () => {
  enableTestAuth();
  const app = await buildAuthApp();
  const mfaCookie = await loginMfa(app);

  const noDeviceFallback = await app.inject({
    method: 'POST',
    url: '/api/v1/checkins',
    headers: {
      ...sameOriginCookieHeaders(mfaCookie),
      'x-client-role': 'terminal',
    },
    payload: { topicId: 'general', authPath: 'phone_dob' },
  });
  assert.equal(noDeviceFallback.statusCode, 401);

  const terminalCookie = await pairDeviceSession(app, {
    kind: 'terminal',
    displayId: 'checkin-terminal',
    mfaCookie,
  });
  const mixedCookie = `${mfaCookie}; ${terminalCookie}`;

  const staffSelected = await app.inject({
    method: 'POST',
    url: '/api/v1/checkins',
    headers: sameOriginCookieHeaders(mixedCookie),
    payload: { topicId: 'general', authPath: 'phone_dob' },
  });
  assert.equal(staffSelected.statusCode, 201);

  const deviceSelected = await app.inject({
    method: 'POST',
    url: '/api/v1/checkins',
    headers: {
      ...sameOriginCookieHeaders(mixedCookie),
      'x-client-role': 'terminal',
    },
    payload: { topicId: 'general', authPath: 'phone_dob' },
  });
  assert.equal(deviceSelected.statusCode, 201);

  const presence = await app.inject({
    method: 'POST',
    url: '/api/v1/ops/device/presence',
    headers: {
      ...sameOriginCookieHeaders(mixedCookie),
      'x-client-role': 'terminal',
    },
    payload: { clientTime: '2026-06-09T18:20:00.000Z' },
  });
  assert.equal(presence.statusCode, 204);

  const terminal = listDevicePresence().find((entry) => entry.deviceId === 'checkin-terminal');
  assert.equal(terminal?.streamConnected, false);
  // Heartbeat without SSE: fresh presence is online until PRESENCE_OFFLINE_AFTER_MS (see device-presence-registry.test.ts).
  assert.equal(terminal?.status, 'online');
  assert.ok(terminal?.lastSeenAt);

  await app.close();
});

test('tv and terminal device cookies can coexist in one browser', async () => {
  enableTestAuth();
  const app = await buildAuthApp();
  const mfaCookie = await loginMfa(app);
  const tvCookie = await pairDeviceSession(app, {
    kind: 'tv',
    displayId: 'waiting-room',
    mfaCookie,
  });
  const terminalCookie = await pairDeviceSession(app, {
    kind: 'terminal',
    displayId: 'checkin-terminal',
    mfaCookie,
  });
  const mixedCookie = `${mfaCookie}; ${tvCookie}; ${terminalCookie}`;

  const tvQueue = await app.inject({
    method: 'GET',
    url: '/api/v1/queue',
    headers: {
      cookie: mixedCookie,
      'x-client-role': 'tv',
    },
  });
  assert.equal(tvQueue.statusCode, 200);
  assert.deepEqual(tvQueue.json(), { role: 'tv' });

  const terminalTopics = await app.inject({
    method: 'GET',
    url: '/api/v1/checkins/topics',
    headers: {
      cookie: mixedCookie,
      'x-client-role': 'terminal',
    },
  });
  assert.equal(terminalTopics.statusCode, 200);
  assert.equal(terminalTopics.json().role, 'terminal');

  await app.close();
});

test('device presence is bound to the authenticated device session', async () => {
  enableTestAuth();
  const app = await buildAuthApp();
  const mfaCookie = await loginMfa(app);
  const tvCookie = await pairDeviceSession(app, {
    kind: 'tv',
    displayId: 'waiting-room',
    mfaCookie,
  });
  const terminalCookie = await pairDeviceSession(app, {
    kind: 'terminal',
    displayId: 'checkin-terminal',
    mfaCookie,
  });

  const tvPresence = await app.inject({
    method: 'POST',
    url: '/api/v1/ops/device/presence',
    headers: sameOriginCookieHeaders(tvCookie),
    payload: { deviceId: 'checkin-terminal', clientTime: '2026-06-09T17:00:00.000Z' },
  });
  assert.equal(tvPresence.statusCode, 204);

  const terminalPresence = await app.inject({
    method: 'POST',
    url: '/api/v1/ops/device/presence',
    headers: sameOriginCookieHeaders(terminalCookie),
    payload: { deviceId: 'waiting-room', clientTime: '2026-06-09T17:00:01.000Z' },
  });
  assert.equal(terminalPresence.statusCode, 204);

  const entries = listDevicePresence();
  const waitingRoom = entries.find((entry) => entry.deviceId === 'waiting-room');
  const terminal = entries.find((entry) => entry.deviceId === 'checkin-terminal');

  assert.equal(waitingRoom?.lastClientTime, '2026-06-09T17:00:00.000Z');
  assert.equal(terminal?.lastClientTime, '2026-06-09T17:00:01.000Z');

  await app.close();
});

test('terminal routes reject requests without any authenticated session', async () => {
  enableTestAuth();
  const app = await buildAuthApp();

  const topics = await app.inject({
    method: 'GET',
    url: '/api/v1/checkins/topics',
  });
  assert.equal(topics.statusCode, 401);

  const checkin = await app.inject({
    method: 'POST',
    url: '/api/v1/checkins',
    payload: { topicId: 'general', authPath: 'phone_dob' },
  });
  assert.equal(checkin.statusCode, 401);

  const mfaCookie = await loginMfa(app);
  const mfaCheckin = await app.inject({
    method: 'POST',
    url: '/api/v1/checkins',
    headers: sameOriginCookieHeaders(mfaCookie),
    payload: { topicId: 'general', authPath: 'phone_dob' },
  });
  assert.equal(mfaCheckin.statusCode, 201);

  await app.close();
});

test('duplicate pairing confirm before device poll is idempotent', async () => {
  enableTestAuth();
  const app = await buildAuthApp();

  const start = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/terminal/pairing/start',
    payload: { displayId: 'checkin-terminal' },
  });
  assert.equal(start.statusCode, 200);
  const started = start.json() as { pairingId: string; code: string };

  const mfaCookie = await loginMfa(app);
  const confirmHeaders = sameOriginCookieHeaders(mfaCookie);

  const firstConfirm = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/terminal/pairing/confirm',
    headers: confirmHeaders,
    payload: { code: started.code },
  });
  assert.equal(firstConfirm.statusCode, 200);

  const secondConfirm = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/terminal/pairing/confirm',
    headers: confirmHeaders,
    payload: { code: started.code },
  });
  assert.equal(secondConfirm.statusCode, 200);
  assert.equal(firstConfirm.json().status, 'paired');
  assert.equal(secondConfirm.json().status, 'already_paired');
  assert.equal(secondConfirm.json().pairingId, firstConfirm.json().pairingId);

  const paired = await app.inject({
    method: 'GET',
    url: `/api/v1/auth/terminal/pairing/${started.pairingId}`,
  });
  assert.equal(paired.statusCode, 200);
  assert.equal(paired.json().paired, true);

  await app.close();
});

test('pairing start is rate limited per client ip', async () => {
  enableTestAuth();
  const app = await buildAuthApp();

  let lastStatus = 0;
  for (let attempt = 0; attempt < 31; attempt += 1) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/terminal/pairing/start',
      payload: { displayId: 'checkin-terminal' },
    });
    lastStatus = response.statusCode;
  }

  assert.equal(lastStatus, 429);
  await app.close();
});

test('pairing confirm is rate limited per mfa session', async () => {
  enableTestAuth();
  const app = await buildAuthApp();
  const mfaCookie = await loginMfa(app);

  let lastStatus = 0;
  for (let attempt = 0; attempt < 21; attempt += 1) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/terminal/pairing/confirm',
      headers: sameOriginCookieHeaders(mfaCookie),
      payload: { code: '0000' },
    });
    lastStatus = response.statusCode;
  }

  assert.equal(lastStatus, 429);
  await app.close();
});
