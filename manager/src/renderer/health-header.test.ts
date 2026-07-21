import assert from 'node:assert/strict';
import test from 'node:test';
import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';
import { collectHealthTiles, deriveOverallStatus } from './health-header.js';

function runtime(overrides: Partial<HostRuntimeHealth> = {}): HostRuntimeHealth {
  return {
    checkedAt: '2026-07-17T12:00:00.000Z',
    envExists: true,
    configuredLanIp: '192.168.1.50',
    appBaseUrl: 'http://192.168.1.50:8080',
    docker: { installed: true, daemonRunning: true, composeAvailable: true, detail: null },
    compose: {
      running: true,
      services: [
        {
          name: 'praxis-flow-app',
          service: 'app',
          state: 'running',
          health: 'healthy',
          publishedPorts: [8080],
        },
        {
          name: 'praxis-flow-sandbox',
          service: 'sandbox',
          state: 'running',
          health: null,
          publishedPorts: [],
        },
      ],
    },
    probes: [
      { id: 'app.health.local', ok: true, message: 'ok' },
      { id: 'app.health.lan', ok: true, message: 'ok' },
    ],
    sandboxScanner: null,
    proxyServer: null,
    ...overrides,
  };
}

test('collectHealthTiles omits proxy when proxyServer is null', () => {
  const tiles = collectHealthTiles(
    runtime({
      compose: {
        running: true,
        services: [
          {
            name: 'praxis-flow-app',
            service: 'app',
            state: 'running',
            health: 'healthy',
            publishedPorts: [8080],
          },
          {
            name: 'praxis-flow-proxy',
            service: 'proxy',
            state: 'running',
            health: null,
            publishedPorts: [80],
          },
        ],
      },
      proxyServer: null,
    }),
  );
  assert.equal(
    tiles.some((tile) => tile.name.toLowerCase().includes('proxy')),
    false,
  );
  assert.equal(
    tiles.some((tile) => tile.name === 'app'),
    true,
  );
});

test('collectHealthTiles shows Proxy-Server when image present and used', () => {
  const tiles = collectHealthTiles(
    runtime({
      proxyServer: {
        enabled: true,
        container: {
          name: 'praxis-flow-proxy',
          service: 'proxy',
          state: 'running',
          health: null,
          publishedPorts: [80],
        },
      },
    }),
  );
  const proxy = tiles.find((tile) => tile.name === 'Proxy-Server');
  assert.ok(proxy);
  assert.equal(proxy.status, 'ok');
});

test('collectHealthTiles shows Proxy-Server missing container as bad', () => {
  const tiles = collectHealthTiles(
    runtime({
      proxyServer: { enabled: true, container: null },
    }),
  );
  const proxy = tiles.find((tile) => tile.name === 'Proxy-Server');
  assert.ok(proxy);
  assert.equal(proxy.detail, 'Container fehlt');
  assert.equal(proxy.status, 'bad');
});

test('collectHealthTiles sandbox ampel uses Compose health, not ClamAV', () => {
  const tiles = collectHealthTiles(
    runtime({
      compose: {
        running: true,
        services: [
          {
            name: 'praxis-flow-sandbox',
            service: 'sandbox',
            state: 'running',
            health: 'healthy',
            publishedPorts: [],
          },
        ],
      },
      sandboxScanner: {
        enabled: true,
        ready: false,
        signaturesFreshEnough: false,
        definitionsUpdatedAt: null,
        definitionsAgeHours: null,
        maxSignatureAgeHours: 24,
        engineVersion: null,
        healthStatus: 'unavailable',
        freshclamLastAttemptAt: null,
        freshclamLastAttemptOk: null,
        freshclamLastAttemptMessage: null,
        freshclamLastAttemptSource: null,
        freshclamLogTail: null,
      },
    }),
  );
  const sandbox = tiles.find((tile) => tile.name === 'sandbox');
  assert.ok(sandbox);
  assert.equal(sandbox.status, 'ok');
  assert.equal(sandbox.detail, 'running — healthy');
  assert.ok(sandbox.chips?.some((chip) => chip.label === 'ClamAV' && chip.ok === false));
});

test('deriveOverallStatus is Betrieb when local and LAN probes are green', () => {
  assert.deepEqual(deriveOverallStatus(runtime()), { text: 'Betrieb', level: 'ok' });
});

test('deriveOverallStatus prefers Proxy-Server fehlt over generic incomplete', () => {
  assert.deepEqual(
    deriveOverallStatus(
      runtime({
        probes: [
          { id: 'app.health.local', ok: true, message: 'ok' },
          { id: 'app.health.lan', ok: false, message: 'down' },
        ],
        proxyServer: { enabled: true, container: null },
      }),
    ),
    { text: 'Proxy-Server fehlt', level: 'warn' },
  );
});

test('deriveOverallStatus reports LAN nicht erreichbar when probe fails', () => {
  assert.deepEqual(
    deriveOverallStatus(
      runtime({
        probes: [
          { id: 'app.health.local', ok: true, message: 'ok' },
          { id: 'app.health.lan', ok: false, message: 'down' },
        ],
      }),
    ),
    { text: 'LAN nicht erreichbar', level: 'warn' },
  );
});
