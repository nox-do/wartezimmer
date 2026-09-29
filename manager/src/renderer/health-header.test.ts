import { collectObservedHealthTiles } from './health-header.js';
import {
  failedRuntimeObservation,
  managerRefreshError,
  runtimeObservationNotice,
  type RuntimeObservation,
} from './runtime-observation.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';
import { collectHealthTiles } from './health-header.js';

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

const proxyContainer = {
  name: 'praxis-flow-proxy',
  service: 'proxy',
  state: 'running',
  health: null as string | null,
  publishedPorts: [80],
};

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

test('collectHealthTiles Proxy-Server is green when Compose up and entry probe ok', () => {
  const tiles = collectHealthTiles(
    runtime({
      proxyServer: { enabled: true, container: proxyContainer },
    }),
  );
  const proxy = tiles.find((tile) => tile.name === 'Proxy-Server');
  assert.ok(proxy);
  assert.equal(proxy.status, 'ok');
  assert.equal(proxy.detail, 'running');
});

test('collectHealthTiles Proxy-Server is yellow when container up but entry fails', () => {
  const tiles = collectHealthTiles(
    runtime({
      probes: [
        { id: 'app.health.local', ok: true, message: 'ok' },
        { id: 'app.health.lan', ok: false, message: 'down' },
      ],
      proxyServer: { enabled: true, container: proxyContainer },
    }),
  );
  const proxy = tiles.find((tile) => tile.name === 'Proxy-Server');
  assert.ok(proxy);
  assert.equal(proxy.status, 'warn');
  assert.match(proxy.detail, /Einstieg nicht erreichbar/);
});

test('collectHealthTiles shows Proxy-Server when enabled even without a stack', () => {
  const tiles = collectHealthTiles(
    runtime({
      compose: { running: false, services: [] },
      proxyServer: { enabled: true, container: null },
    }),
  );
  const proxy = tiles.find((tile) => tile.name === 'Proxy-Server');
  assert.ok(proxy);
  assert.equal(proxy.detail, 'Container fehlt');
  assert.equal(
    tiles.some((tile) => tile.name === 'app' || tile.name === 'sandbox'),
    false,
  );
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

test('collectHealthTiles with proxy keeps App as stack-only Compose ampel', () => {
  const tiles = collectHealthTiles(
    runtime({
      probes: [
        { id: 'app.health.local', ok: true, message: 'ok' },
        { id: 'app.health.lan', ok: false, message: 'down' },
      ],
      proxyServer: { enabled: true, container: proxyContainer },
    }),
  );
  const app = tiles.find((tile) => tile.name === 'app');
  assert.ok(app);
  assert.equal(app.status, 'ok');
  assert.equal(app.detail, 'running — healthy');
  assert.equal(app.chips, undefined);
});

test('collectHealthTiles without proxy puts entry on App ampel', () => {
  const tiles = collectHealthTiles(
    runtime({
      probes: [
        { id: 'app.health.local', ok: true, message: 'ok' },
        { id: 'app.health.lan', ok: false, message: 'down' },
      ],
    }),
  );
  const app = tiles.find((tile) => tile.name === 'app');
  assert.ok(app);
  assert.equal(app.status, 'warn');
  assert.match(app.detail, /Einstieg nicht erreichbar/);
  assert.equal(app.chips, undefined);
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
        healthStatus: 'degraded',
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
  assert.ok(
    sandbox.chips?.some((chip) => chip.label === 'not started' && chip.ok === false && !chip.warn),
  );
});

test('collectHealthTiles with disabled leftover proxy keeps entry on App', () => {
  const tiles = collectHealthTiles(
    runtime({
      probes: [
        { id: 'app.health.local', ok: true, message: 'ok' },
        { id: 'app.health.lan', ok: false, message: 'down' },
      ],
      proxyServer: {
        enabled: false,
        container: proxyContainer,
      },
    }),
  );
  assert.equal(
    tiles.some((tile) => tile.name === 'Proxy-Server'),
    false,
  );
  const app = tiles.find((tile) => tile.name === 'app');
  assert.ok(app);
  assert.equal(app.status, 'warn');
  assert.match(app.detail, /Einstieg nicht erreichbar/);
});

test('collectHealthTiles shows Keine Container without waiting when stack is down', () => {
  const tiles = collectHealthTiles(
    runtime({
      compose: { running: false, services: [] },
      probes: [],
    }),
  );
  assert.deepEqual(tiles, [{ name: 'Stack', detail: 'Keine Container', status: null }]);
});

test('DNS filter suspicion appears on the entry tile as a warning with and without proxy', () => {
  for (const proxy of [false, true]) {
    const tiles = collectHealthTiles(
      runtime({
        proxyServer: proxy ? { enabled: true, container: proxyContainer } : null,
        probes: [
          { id: 'app.health.local', ok: true, message: 'ok' },
          { id: 'app.health.lan', ok: false, message: 'DNS', reason: 'dns-rebind' },
        ],
      }),
    );
    const tile = tiles.find((item) => item.name === (proxy ? 'Proxy-Server' : 'app'))!;
    assert.equal(tile.status, 'warn');
    assert.match(tile.detail, /DNS-Rebind-Schutz.*möglich/);
    assert.doesNotMatch(tile.detail, /Einstieg nicht erreichbar/);
  }
});

test('observation failures preserve last known evidence, mark tiles stale and recover', () => {
  const snapshot = runtime();
  const error = managerRefreshError(new Error('secret technical detail'));
  let observation: RuntimeObservation = { kind: 'idle' };
  assert.equal(collectObservedHealthTiles(observation).length, 0);
  observation = failedRuntimeObservation(observation, error, 'first-failure');
  assert.equal(observation.kind, 'unavailable');
  assert.equal(collectObservedHealthTiles(observation).length, 0);
  assert.doesNotMatch(runtimeObservationNotice(observation)!, /secret/);
  observation = { kind: 'current', snapshot };
  const originalTiles = collectObservedHealthTiles(observation);
  observation = failedRuntimeObservation(observation, error, 'second-failure');
  assert.equal(observation.kind, 'stale');
  assert.ok('snapshot' in observation);
  assert.equal(observation.snapshot, snapshot);
  assert.equal(observation.failedAt, 'second-failure');
  const tiles = collectObservedHealthTiles(observation);
  assert.deepEqual(
    tiles.map((tile) => tile.name),
    originalTiles.map((tile) => tile.name),
  );
  assert.ok(tiles.every((tile) => tile.status === null && tile.detail.startsWith('Veraltet')));
  assert.ok(runtimeObservationNotice(observation)?.includes(snapshot.checkedAt));
  const repeated = failedRuntimeObservation(observation, error, 'third-failure');
  assert.ok('snapshot' in repeated);
  assert.equal(repeated.snapshot, snapshot);
  assert.ok('failedAt' in repeated);
  assert.equal(repeated.failedAt, 'third-failure');
  observation = { kind: 'current', snapshot: { ...snapshot, checkedAt: 'recovered' } };
  assert.equal(runtimeObservationNotice(observation), null);
  assert.deepEqual(collectObservedHealthTiles(observation), originalTiles);
});

test('missing Compose evidence never displays an observed empty stack', () => {
  const tiles = collectHealthTiles(runtime({ compose: null, proxyServer: null }));
  assert.equal(tiles[0]?.detail, 'Containerstatus nicht prüfbar');
});
