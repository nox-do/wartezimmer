import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test, { afterEach, beforeEach } from 'node:test';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerClientAuth } from '../../auth/client-auth.js';
import {
  createStaffSessionManager,
  getAuthSettingsSeedConfig,
  getStaffSessionCookieName,
} from '../../auth/staff-session-auth.js';
import type { CoreDatabase } from '../../shared/db/database.js';
import { resetDevicePairingForTests } from '../../shared/ops/device-pairing-registry.js';
import {
  markDeviceStreamConnected,
  recordDevicePresence,
  resetDevicePresenceForTests,
  TERMINAL_DEVICE_ID,
  WAITING_ROOM_DEVICE_ID,
} from '../../shared/ops/device-presence-registry.js';
import { resetOpsEventHubForTests } from '../../shared/ops/ops-event-hub.js';
import { registerAuthRoutes } from '../auth-routes.js';
import { registerOpsEmergencyRoutes } from './ops-emergency-routes.js';
import { registerOpsStreamRoutes } from './ops-stream-routes.js';

const ENV_KEYS = ['AUTH_ENABLED', 'AUTH_KEY_CAPTIVE', 'NODE_ENV'] as const;
const savedEnv = new Map<string, string | undefined>();

type SseEvent = {
  event: string;
  data: unknown;
};

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

function fakeOpsDb(): CoreDatabase {
  let emergencyState = {
    active: false,
    emergencyId: null as string | null,
    raisedAt: null as string | null,
    acknowledgedAt: null as string | null,
  };

  return {
    getEmergencyState: () => emergencyState,
    raiseEmergency: () => {
      const raisedAt = new Date().toISOString();
      emergencyState = {
        active: true,
        emergencyId: 'em-1',
        raisedAt,
        acknowledgedAt: null,
      };
      return {
        emergencyId: 'em-1',
        status: 'raised' as const,
        raisedAt,
        alreadyActive: false,
      };
    },
    acknowledgeEmergency: () => {
      const acknowledgedAt = new Date().toISOString();
      emergencyState = {
        active: false,
        emergencyId: emergencyState.emergencyId ?? 'em-1',
        raisedAt: emergencyState.raisedAt,
        acknowledgedAt,
      };
      return {
        emergencyId: emergencyState.emergencyId ?? 'em-1',
        status: 'acknowledged' as const,
        raisedAt: emergencyState.raisedAt ?? acknowledgedAt,
        acknowledgedAt,
        uiDisplayed: true as const,
      };
    },
  } as unknown as CoreDatabase;
}

async function readSseEvents(
  body: ReadableStream<Uint8Array> | null,
  stopWhen: (events: SseEvent[]) => boolean,
  timeoutMs = 2000,
): Promise<SseEvent[]> {
  assert.ok(body);
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events: SseEvent[] = [];
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';

    for (const chunk of chunks) {
      if (!chunk.trim() || chunk.startsWith(':')) {
        continue;
      }

      const lines = chunk.split('\n');
      const eventLine = lines.find((line) => line.startsWith('event: '));
      const dataLine = lines.find((line) => line.startsWith('data: '));
      if (!eventLine || !dataLine) {
        continue;
      }

      events.push({
        event: eventLine.slice('event: '.length),
        data: JSON.parse(dataLine.slice('data: '.length)),
      });

      if (stopWhen(events)) {
        await reader.cancel();
        return events;
      }
    }
  }

  await reader.cancel();
  return events;
}

async function closeSseTest(app: FastifyInstance): Promise<void> {
  app.server.closeAllConnections();
  await app.close();
}

beforeEach(() => {
  saveEnv();
  resetDevicePresenceForTests();
  resetDevicePairingForTests();
  resetOpsEventHubForTests();
});

afterEach(() => {
  restoreEnv();
  resetDevicePresenceForTests();
  resetDevicePairingForTests();
  resetOpsEventHubForTests();
});

test('ops stream sends initial emergency, presence, and pairing snapshots', async () => {
  enableTestAuth();
  const app = Fastify({ logger: false });
  const sessions = createStaffSessionManager({ sessionTtlMs: 60 * 60 * 1000 });
  const { token: staffToken } = sessions.createStaffSession('mfa');

  registerClientAuth(app, { staffSessions: sessions });
  registerOpsStreamRoutes(app, fakeOpsDb(), sessions);
  markDeviceStreamConnected({ deviceId: 'room-panel:labor:outside', kind: 'room-panel' });

  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  assert.equal(typeof address, 'object');
  assert.ok(address);
  const port = (address as AddressInfo).port;

  const response = await fetch(`http://127.0.0.1:${port}/api/v1/ops/stream`, {
    headers: {
      cookie: `${getStaffSessionCookieName()}=${staffToken}`,
    },
  });
  assert.equal(response.status, 200);

  const events = await readSseEvents(response.body, (received) => {
    const eventNames = new Set(received.map((entry) => entry.event));
    return (
      eventNames.has('emergency') &&
      received.filter((entry) => entry.event === 'device.presence').length >= 3 &&
      received.filter((entry) => entry.event === 'device.pairing').length >= 2
    );
  });

  assert.ok(events.some((entry) => entry.event === 'emergency'));
  assert.ok(
    events.some(
      (entry) =>
        entry.event === 'device.presence' &&
        (entry.data as { deviceId?: string }).deviceId === WAITING_ROOM_DEVICE_ID,
    ),
  );
  assert.ok(
    events.some(
      (entry) =>
        entry.event === 'device.presence' &&
        (entry.data as { deviceId?: string }).deviceId === TERMINAL_DEVICE_ID,
    ),
  );
  assert.ok(
    events.some(
      (entry) =>
        entry.event === 'device.presence' &&
        (entry.data as { deviceId?: string; kind?: string }).deviceId ===
          'room-panel:labor:outside' &&
        (entry.data as { deviceId?: string; kind?: string }).kind === 'room-panel',
    ),
  );
  assert.ok(
    events.some(
      (entry) =>
        entry.event === 'device.pairing' && (entry.data as { kind?: string }).kind === 'tv',
    ),
  );
  assert.ok(
    events.some(
      (entry) =>
        entry.event === 'device.pairing' && (entry.data as { kind?: string }).kind === 'terminal',
    ),
  );

  await closeSseTest(app);
});

test('ops stream pushes device.presence updates to open MFA connections', async () => {
  enableTestAuth();
  const app = Fastify({ logger: false });
  const sessions = createStaffSessionManager({ sessionTtlMs: 60 * 60 * 1000 });
  const { token: staffToken } = sessions.createStaffSession('mfa');

  registerClientAuth(app, { staffSessions: sessions });
  registerOpsStreamRoutes(app, fakeOpsDb(), sessions);

  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  assert.equal(typeof address, 'object');
  assert.ok(address);
  const port = (address as AddressInfo).port;

  const response = await fetch(`http://127.0.0.1:${port}/api/v1/ops/stream`, {
    headers: {
      cookie: `${getStaffSessionCookieName()}=${staffToken}`,
    },
  });
  assert.equal(response.status, 200);

  try {
    const readPromise = readSseEvents(
      response.body,
      (received) =>
        received.some(
          (entry) =>
            entry.event === 'device.presence' &&
            (entry.data as { revision?: number }).revision === 1 &&
            (entry.data as { status?: string }).status === 'online',
        ),
      3000,
    );

    markDeviceStreamConnected({ deviceId: TERMINAL_DEVICE_ID, kind: 'terminal' });
    recordDevicePresence({ deviceId: TERMINAL_DEVICE_ID, kind: 'terminal' });
    const events = await readPromise;

    assert.ok(
      events.some(
        (entry) =>
          entry.event === 'device.presence' &&
          (entry.data as { deviceId?: string }).deviceId === TERMINAL_DEVICE_ID &&
          (entry.data as { status?: string }).status === 'online',
      ),
    );
  } finally {
    await closeSseTest(app);
  }
});

test('ops stream pushes device.pairing when terminal pairing starts', async () => {
  enableTestAuth();
  const app = Fastify({ logger: false });
  const sessions = createStaffSessionManager({ sessionTtlMs: 60 * 60 * 1000 });
  const { token: staffToken } = sessions.createStaffSession('mfa');

  registerClientAuth(app, { staffSessions: sessions });
  registerAuthRoutes(app, sessions, {
    getOpsSettings: () => ({ rooms: [] }),
    getAuthSettings: () => {
      const seed = getAuthSettingsSeedConfig();
      return {
        staffPinHashMfa: seed.pinHashesByRole.mfa,
        staffPinHashOps: seed.pinHashesByRole.ops,
        roomPanelPinHash: seed.roomPanelPinHash,
        updatedAt: new Date().toISOString(),
      };
    },
    updateAuthPinHash: () => {
      throw new Error('not implemented');
    },
  });
  registerOpsStreamRoutes(app, fakeOpsDb(), sessions);

  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  assert.equal(typeof address, 'object');
  assert.ok(address);
  const port = (address as AddressInfo).port;

  const response = await fetch(`http://127.0.0.1:${port}/api/v1/ops/stream`, {
    headers: {
      cookie: `${getStaffSessionCookieName()}=${staffToken}`,
    },
  });
  assert.equal(response.status, 200);

  const readPromise = readSseEvents(
    response.body,
    (received) =>
      received.some(
        (entry) =>
          entry.event === 'device.pairing' &&
          (entry.data as { kind?: string }).kind === 'terminal' &&
          (entry.data as { phase?: string }).phase === 'pending' &&
          (entry.data as { revision?: number }).revision === 1,
      ),
    3000,
  );

  const start = await fetch(`http://127.0.0.1:${port}/api/v1/auth/terminal/pairing/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(start.status, 200);

  const events = await readPromise;
  assert.ok(
    events.some(
      (entry) =>
        entry.event === 'device.pairing' &&
        (entry.data as { kind?: string }).kind === 'terminal' &&
        (entry.data as { phase?: string }).phase === 'pending',
    ),
  );

  await closeSseTest(app);
});

test('ops stream pushes emergency updates when emergency is raised', async () => {
  enableTestAuth();
  const app = Fastify({ logger: false });
  const sessions = createStaffSessionManager({ sessionTtlMs: 60 * 60 * 1000 });
  const { token: staffToken } = sessions.createStaffSession('mfa');

  registerClientAuth(app, { staffSessions: sessions });
  registerOpsEmergencyRoutes(app, fakeOpsDb());
  registerOpsStreamRoutes(app, fakeOpsDb(), sessions);

  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  assert.equal(typeof address, 'object');
  assert.ok(address);
  const port = (address as AddressInfo).port;

  const response = await fetch(`http://127.0.0.1:${port}/api/v1/ops/stream`, {
    headers: {
      cookie: `${getStaffSessionCookieName()}=${staffToken}`,
    },
  });
  assert.equal(response.status, 200);

  const readPromise = readSseEvents(
    response.body,
    (received) =>
      received.some(
        (entry) =>
          entry.event === 'emergency' &&
          (entry.data as { active?: boolean }).active === true &&
          (entry.data as { revision?: number }).revision === 1,
      ),
    3000,
  );

  const raise = await fetch(`http://127.0.0.1:${port}/api/v1/ops/emergency/raise`, {
    method: 'POST',
    headers: {
      cookie: `${getStaffSessionCookieName()}=${staffToken}`,
      origin: `http://127.0.0.1:${port}`,
    },
  });
  assert.equal(raise.status, 200);

  const events = await readPromise;
  assert.ok(
    events.some(
      (entry) =>
        entry.event === 'emergency' && (entry.data as { active?: boolean }).active === true,
    ),
  );

  await closeSseTest(app);
});
