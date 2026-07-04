import assert from 'node:assert/strict';
import test from 'node:test';
import type { HostRuntimeHealth } from '@praxis-flow/server-shared';
import type { HostStatus } from '../shared/host-status.js';
import { createHostRefreshController } from './host-refresh-controller.js';

function minimalStatus(overrides: Partial<HostStatus> = {}): HostStatus {
  return {
    installHome: '/tmp/pf',
    mode: 'install',
    composeProjectName: 'pf-test',
    projectRoot: '/tmp/pf',
    envExists: true,
    envPath: '/tmp/pf/.env',
    practiceDisplayName: 'Test',
    docker: {
      installed: true,
      daemonRunning: true,
      composeAvailable: true,
      detail: null,
    },
    folders: { imports: '/tmp/imports', exports: '/tmp/exports' },
    appBaseUrl: 'http://192.168.1.10:8080',
    network: { configuredLanIp: '192.168.1.10', currentLanCandidates: [], lanIpStale: false },
    gateway: null,
    deviceUrls: null,
    probes: [],
    compose: { running: true, services: [] },
    sandboxScanner: null,
    networkBindings: [],
    deliveryImages: {
      required: false,
      configured: true,
      appImage: null,
      sandboxImage: null,
      releaseVersion: null,
      archiveSha256: null,
      appPresent: true,
      sandboxPresent: true,
      ready: true,
    },
    ...overrides,
  };
}

function minimalRuntime(overrides: Partial<HostRuntimeHealth> = {}): HostRuntimeHealth {
  const status = minimalStatus();
  return {
    checkedAt: '2026-06-30T12:00:00.000Z',
    envExists: status.envExists,
    configuredLanIp: status.network.configuredLanIp,
    docker: status.docker,
    compose: status.compose,
    probes: [{ id: 'app.health.local', ok: true, message: 'ok' }],
    sandboxScanner: null,
    ...overrides,
  };
}

function mockApi(overrides: {
  fetchSetupStatus?: () => Promise<HostStatus>;
  fetchRuntimeHealth?: () => Promise<HostRuntimeHealth>;
} = {}) {
  return {
    fetchSetupStatus: overrides.fetchSetupStatus ?? (async () => minimalStatus()),
    fetchRuntimeHealth: overrides.fetchRuntimeHealth ?? (async () => minimalRuntime()),
  } as never;
}

test('refresh applies runtime and config on full scope', async () => {
  const status = minimalStatus();
  const runtime = minimalRuntime();
  const runtimes: HostRuntimeHealth[] = [];
  const configs: HostStatus[] = [];

  const controller = createHostRefreshController({
    api: () =>
      mockApi({
        fetchSetupStatus: async () => status,
        fetchRuntimeHealth: async () => runtime,
      }),
    pollIntervalMs: 60_000,
    onRuntime: (value) => runtimes.push(value),
    onConfig: (snapshot) => configs.push(snapshot),
    onError: () => {},
    schedule: () => 0,
    clearSchedule: () => {},
  });

  controller.setView('status');
  await controller.refresh({ scope: 'full', immediate: true });

  assert.equal(runtimes.length, 1);
  assert.equal(configs.length, 1);
  assert.equal(runtimes[0]?.configuredLanIp, '192.168.1.10');
  assert.equal(runtimes[0]?.checkedAt, runtime.checkedAt);
});

test('runtime refresh does not push config snapshot', async () => {
  const configs: HostStatus[] = [];
  const controller = createHostRefreshController({
    api: () => mockApi(),
    pollIntervalMs: 60_000,
    onRuntime: () => {},
    onConfig: (snapshot) => configs.push(snapshot),
    onError: () => {},
    schedule: () => 0,
    clearSchedule: () => {},
  });

  await controller.refresh({ scope: 'runtime', silent: true });
  assert.equal(configs.length, 0);
});

test('stale refresh result is discarded when a newer refresh starts', async () => {
  let resolveSlow!: () => void;
  const slow = new Promise<void>((resolve) => {
    resolveSlow = resolve;
  });
  let calls = 0;
  const runtimes: string[] = [];

  const controller = createHostRefreshController({
    api: () =>
      mockApi({
        fetchRuntimeHealth: async () => {
          calls += 1;
          if (calls === 1) {
            await slow;
          }
          return minimalRuntime({ checkedAt: `gen-${calls}` });
        },
      }),
    pollIntervalMs: 60_000,
    onRuntime: (runtime) => runtimes.push(runtime.checkedAt),
    onConfig: () => {},
    onError: () => {},
    schedule: () => 0,
    clearSchedule: () => {},
  });

  const first = controller.refresh({ scope: 'runtime', silent: true });
  const second = controller.refresh({ scope: 'runtime', silent: true, immediate: true });
  resolveSlow();
  await Promise.all([first, second]);

  assert.equal(calls, 2);
  assert.equal(runtimes.length, 1);
  assert.equal(runtimes[0], 'gen-2');
  assert.equal(controller.getLastConfig(), null);
});

test('poll uses setTimeout after refresh completes', async () => {
  const timers: Array<{ delay: number; cb: () => void }> = [];
  let pollRuns = 0;

  const controller = createHostRefreshController({
    api: () => mockApi(),
    pollIntervalMs: 5_000,
    onRuntime: () => {
      pollRuns += 1;
    },
    onConfig: () => {},
    onError: () => {},
    schedule: (cb, delay) => {
      timers.push({ delay, cb });
      return timers.length;
    },
    clearSchedule: () => {
      timers.length = 0;
    },
  });

  controller.setView('status');
  await controller.refresh({ scope: 'full', immediate: true });
  assert.equal(pollRuns, 1);
  assert.equal(timers.length, 1);
  assert.equal(timers[0]?.delay, 5_000);

  timers[0]?.cb();
  await controller.refresh({ scope: 'runtime', silent: true });
  assert.equal(pollRuns, 2);
});
