import assert from 'node:assert/strict';
import test from 'node:test';
import type { HostRuntimeHealth } from '@praxis-flow/server-shared/setup-api';
import type { HostStatus } from '../shared/host-status.js';
import { freshInstallHostStatus, minimalHostStatus } from './test-fixtures/minimal-host-status.js';
import { createHostRefreshController } from './host-refresh-controller.js';

function minimalRuntime(overrides: Partial<HostRuntimeHealth> = {}): HostRuntimeHealth {
  const status = minimalHostStatus();
  return {
    checkedAt: '2026-06-30T12:00:00.000Z',
    envExists: status.envExists,
    configuredLanIp: status.network.configuredLanIp,
    appBaseUrl: status.appBaseUrl,
    docker: status.docker,
    compose: status.compose,
    probes: [{ id: 'app.health.local', ok: true, message: 'ok' }],
    sandboxScanner: null,
    proxyServer: null,
    ...overrides,
  };
}

function mockApi(
  overrides: {
    fetchSetupStatus?: () => Promise<HostStatus>;
    fetchRuntimeHealth?: () => Promise<HostRuntimeHealth>;
  } = {},
) {
  return {
    fetchSetupStatus: overrides.fetchSetupStatus ?? (async () => minimalHostStatus()),
    fetchRuntimeHealth: overrides.fetchRuntimeHealth ?? (async () => minimalRuntime()),
  } as never;
}

test('refresh applies runtime and config on full scope once ops snapshot exists', async () => {
  const status = minimalHostStatus();
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
  await controller.refresh({ scope: 'config' });
  await controller.refresh({ scope: 'full' });

  assert.equal(configs.length, 2);
  assert.equal(runtimes.length, 1);
  assert.equal(runtimes[0]?.configuredLanIp, '192.168.1.10');
  assert.equal(runtimes[0]?.checkedAt, runtime.checkedAt);
});

test('config-only does not fetch runtime or start a poll timer', async () => {
  let runtimeCalls = 0;
  const timers: unknown[] = [];
  const controller = createHostRefreshController({
    api: () =>
      mockApi({
        fetchSetupStatus: async () => freshInstallHostStatus(),
        fetchRuntimeHealth: async () => {
          runtimeCalls += 1;
          return minimalRuntime();
        },
      }),
    pollIntervalMs: 5_000,
    onRuntime: () => {},
    onConfig: () => {},
    onError: () => {},
    schedule: (cb) => {
      timers.push(cb);
      return timers.length;
    },
    clearSchedule: () => {
      timers.length = 0;
    },
  });

  const status = await controller.refresh({ scope: 'config' });
  assert.equal(status?.envExists, false);
  assert.equal(runtimeCalls, 0);
  assert.equal(timers.length, 0);
  assert.equal(controller.getLastRuntime(), null);
});

test('mutation refresh applies config and runtime as one generation', async () => {
  const configs: string[] = [];
  const runtimes: string[] = [];
  const controller = createHostRefreshController({
    api: () =>
      mockApi({
        fetchSetupStatus: async () => minimalHostStatus({ practiceDisplayName: 'Fresh config' }),
        fetchRuntimeHealth: async () => minimalRuntime({ checkedAt: 'fresh-runtime' }),
      }),
    onConfig: (status) => configs.push(status.practiceDisplayName ?? ''),
    onRuntime: (runtime) => runtimes.push(runtime.checkedAt),
    onError: () => {},
    schedule: () => 0,
    clearSchedule: () => {},
  });

  await controller.refresh({ scope: 'mutation' });

  assert.deepEqual(configs, ['Fresh config']);
  assert.deepEqual(runtimes, ['fresh-runtime']);
});

test('newer full refresh supersedes an entire mutation refresh without losing config', async () => {
  let releaseMutation!: () => void;
  const mutationGate = new Promise<void>((resolve) => {
    releaseMutation = resolve;
  });
  let configCalls = 0;
  const configs: string[] = [];
  const controller = createHostRefreshController({
    api: () =>
      mockApi({
        fetchSetupStatus: async () => {
          configCalls += 1;
          if (configCalls === 2) {
            await mutationGate;
            return minimalHostStatus({ practiceDisplayName: 'Stale mutation' });
          }
          return minimalHostStatus({
            practiceDisplayName: configCalls === 1 ? 'Initial' : 'Fresh full refresh',
          });
        },
      }),
    onConfig: (status) => configs.push(status.practiceDisplayName ?? ''),
    onRuntime: () => {},
    onError: () => {},
    schedule: () => 0,
    clearSchedule: () => {},
  });

  await controller.refresh({ scope: 'config' });
  const mutation = controller.refresh({ scope: 'mutation' });
  const full = controller.refresh({ scope: 'full' });
  releaseMutation();
  await Promise.all([mutation, full]);

  assert.deepEqual(configs, ['Initial', 'Fresh full refresh']);
  assert.equal(controller.getLastConfig()?.practiceDisplayName, 'Fresh full refresh');
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

  await controller.refresh({ scope: 'config' });
  const configCount = configs.length;
  await controller.refresh({ scope: 'runtime', silent: true });
  assert.equal(configs.length, configCount);
});

test('silent runtime poll reports failure so the last healthy snapshot is not presented as current', async () => {
  let runtimeCalls = 0;
  const errors: Array<{ message: string; source: string }> = [];
  const controller = createHostRefreshController({
    api: () =>
      mockApi({
        fetchRuntimeHealth: async () => {
          runtimeCalls += 1;
          if (runtimeCalls === 1) return minimalRuntime({ checkedAt: 'healthy' });
          throw new Error('runtime unavailable');
        },
      }),
    onRuntime: () => {},
    onConfig: () => {},
    onError: (message, _view, source) => errors.push({ message, source }),
    schedule: () => 0,
    clearSchedule: () => {},
  });

  await controller.refresh({ scope: 'config' });
  await controller.refresh({ scope: 'runtime', silent: true });
  await controller.refresh({ scope: 'runtime', silent: true });

  assert.equal(controller.getLastRuntime()?.checkedAt, 'healthy');
  assert.deepEqual(errors, [{ message: 'runtime unavailable', source: 'runtime' }]);
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

  await controller.refresh({ scope: 'config' });
  const first = controller.refresh({ scope: 'runtime', silent: true });
  const second = controller.refresh({ scope: 'runtime', silent: true });
  resolveSlow();
  await Promise.all([first, second]);

  assert.equal(calls, 2);
  assert.equal(runtimes.length, 1);
  assert.equal(runtimes[0], 'gen-2');
});

test('poll uses setTimeout after runtime refresh when .env exists', async () => {
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
  await controller.refresh({ scope: 'config' });
  assert.equal(pollRuns, 0);
  assert.equal(timers.length, 0);
  await controller.refresh({ scope: 'runtime', silent: true });
  assert.equal(pollRuns, 1);
  assert.equal(timers.length, 1);
  assert.equal(timers[0]?.delay, 5_000);

  timers[0]?.cb();
  await controller.refresh({ scope: 'runtime', silent: true });
  assert.equal(pollRuns, 2);
});

test('poll continues while wizard view is active when .env exists', async () => {
  const timers: Array<{ delay: number; cb: () => void }> = [];

  const controller = createHostRefreshController({
    api: () => mockApi(),
    pollIntervalMs: 5_000,
    onRuntime: () => {},
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

  await controller.refresh({ scope: 'config' });
  controller.setView('wizard');
  await controller.refresh({ scope: 'runtime', silent: true });
  assert.equal(timers.length, 1);
  assert.equal(timers[0]?.delay, 5_000);
});

test('poll continues on status view when .env exists', async () => {
  const timers: Array<{ delay: number; cb: () => void }> = [];

  const controller = createHostRefreshController({
    api: () => mockApi(),
    pollIntervalMs: 5_000,
    onRuntime: () => {},
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
  await controller.refresh({ scope: 'config' });
  await controller.refresh({ scope: 'runtime', silent: true });
  assert.equal(timers.length, 1);
});

test('without .env a config-only refresh does not start a poll timer', async () => {
  const timers: unknown[] = [];
  const controller = createHostRefreshController({
    api: () =>
      mockApi({
        fetchSetupStatus: async () => freshInstallHostStatus(),
      }),
    pollIntervalMs: 5_000,
    onRuntime: () => {},
    onConfig: () => {},
    onError: () => {},
    schedule: (cb) => {
      timers.push(cb);
      return timers.length;
    },
    clearSchedule: () => {
      timers.length = 0;
    },
  });

  controller.setView('status');
  await controller.refresh({ scope: 'config' });
  controller.setView('wizard');
  await controller.refresh({ scope: 'runtime', silent: true });
  assert.equal(timers.length, 0);
  assert.equal(controller.getLastRuntime(), null);
});

test('full refresh keeps config when only runtime health fails', async () => {
  const status = minimalHostStatus({ practiceDisplayName: 'Kept' });
  const configs: HostStatus[] = [];
  const runtimes: HostRuntimeHealth[] = [];
  const errors: Array<{ message: string; source: string }> = [];

  const controller = createHostRefreshController({
    api: () =>
      mockApi({
        fetchSetupStatus: async () => status,
        fetchRuntimeHealth: async () => {
          throw new Error('health down');
        },
      }),
    pollIntervalMs: 60_000,
    onRuntime: (value) => runtimes.push(value),
    onConfig: (snapshot) => configs.push(snapshot),
    onError: (message, _view, source) => {
      errors.push({ message, source });
    },
    schedule: () => 0,
    clearSchedule: () => {},
  });

  await controller.refresh({ scope: 'config' });
  await controller.refresh({ scope: 'full' });

  assert.equal(configs.length, 2);
  assert.equal(configs[1]?.practiceDisplayName, 'Kept');
  assert.equal(controller.getLastConfig()?.practiceDisplayName, 'Kept');
  assert.equal(runtimes.length, 0);
  assert.deepEqual(errors, [{ message: 'health down', source: 'runtime' }]);
});

test('full refresh keeps runtime when only config fetch fails', async () => {
  const runtime = minimalRuntime({ checkedAt: 'runtime-ok' });
  const configs: HostStatus[] = [];
  const runtimes: HostRuntimeHealth[] = [];
  const errors: Array<{ message: string; source: string }> = [];
  let configCalls = 0;

  const controller = createHostRefreshController({
    api: () =>
      mockApi({
        fetchSetupStatus: async () => {
          configCalls += 1;
          if (configCalls === 1) {
            return minimalHostStatus();
          }
          throw new Error('config down');
        },
        fetchRuntimeHealth: async () => runtime,
      }),
    pollIntervalMs: 60_000,
    onRuntime: (value) => runtimes.push(value),
    onConfig: (snapshot) => configs.push(snapshot),
    onError: (message, _view, source) => {
      errors.push({ message, source });
    },
    schedule: () => 0,
    clearSchedule: () => {},
  });

  await controller.refresh({ scope: 'config' });
  await controller.refresh({ scope: 'full' });

  assert.equal(runtimes.length, 1);
  assert.equal(controller.getLastRuntime()?.checkedAt, 'runtime-ok');
  assert.equal(configs.length, 1);
  assert.equal(controller.getLastConfig()?.envExists, true);
  assert.deepEqual(errors, [{ message: 'config down', source: 'config' }]);
});

test('full refresh applies runtime before slow config settles', async () => {
  let resolveConfig!: () => void;
  const configGate = new Promise<void>((resolve) => {
    resolveConfig = resolve;
  });
  const order: string[] = [];
  let configCalls = 0;

  const controller = createHostRefreshController({
    api: () =>
      mockApi({
        fetchSetupStatus: async () => {
          configCalls += 1;
          if (configCalls === 1) {
            return minimalHostStatus();
          }
          await configGate;
          order.push('config');
          return minimalHostStatus();
        },
        fetchRuntimeHealth: async () => {
          order.push('runtime');
          return minimalRuntime({ checkedAt: 'fast-runtime' });
        },
      }),
    pollIntervalMs: 60_000,
    onRuntime: () => {
      order.push('onRuntime');
    },
    onConfig: () => {
      order.push('onConfig');
    },
    onError: () => {},
    schedule: () => 0,
    clearSchedule: () => {},
  });

  await controller.refresh({ scope: 'config' });
  order.length = 0;
  const refreshDone = controller.refresh({ scope: 'full' });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(order, ['runtime', 'onRuntime']);
  assert.equal(controller.getLastRuntime()?.checkedAt, 'fast-runtime');

  resolveConfig();
  await refreshDone;
  assert.deepEqual(order, ['runtime', 'onRuntime', 'config', 'onConfig']);
});

test('runtime poll refreshes stale device URLs after proxy activation', async () => {
  const old = minimalHostStatus();
  const updated = minimalHostStatus({
    appBaseUrl: 'http://192.168.1.10',
    configuredCanonicalBaseUrl: 'http://192.168.1.10',
    proxy: { ...old.proxy, enabled: true, mode: 'http', httpPort: 80 },
    deviceUrls: {
      ...old.deviceUrls!,
      appBaseUrl: 'http://192.168.1.10',
      terminal: 'http://192.168.1.10/terminal',
    },
  });
  let calls = 0;
  const configs: HostStatus[] = [];
  const controller = createHostRefreshController({
    api: () =>
      mockApi({
        fetchSetupStatus: async () => (++calls === 1 ? old : updated),
        fetchRuntimeHealth: async () =>
          minimalRuntime({
            appBaseUrl: updated.appBaseUrl,
            proxyServer: { enabled: true, container: null },
          }),
      }),
    onConfig: (status) => configs.push(status),
    onRuntime: () => {},
    onError: () => {},
    schedule: () => 0,
    clearSchedule: () => {},
  });
  await controller.refresh({ scope: 'config' });
  await controller.refresh({ scope: 'runtime' });
  assert.equal(calls, 2);
  assert.equal(controller.getLastConfig()?.proxy.enabled, true);
  assert.equal(configs.at(-1)?.deviceUrls?.terminal, 'http://192.168.1.10/terminal');
});

test('runtime poll cannot supersede a mutation config refresh', async () => {
  const disabled = minimalHostStatus({
    deviceUrls: {
      appBaseUrl: 'http://192.168.1.10:8080',
      terminal: 'http://192.168.1.10:8080/terminal',
      mfa: 'http://192.168.1.10:8080/mfa',
      tv: 'http://192.168.1.10:8080/tv',
      ops: 'http://192.168.1.10:8080/ops',
      opsSetup: 'http://192.168.1.10:8080/ops/setup',
      portal: 'http://192.168.1.10:8080/portal',
    },
  });
  const enabled = minimalHostStatus({
    appBaseUrl: 'http://192.168.1.10',
    configuredCanonicalBaseUrl: 'http://192.168.1.10',
    proxy: { ...disabled.proxy, enabled: true, mode: 'http' },
    deviceUrls: {
      appBaseUrl: 'http://192.168.1.10',
      terminal: 'http://192.168.1.10/terminal',
      mfa: 'http://192.168.1.10/mfa',
      tv: 'http://192.168.1.10/tv',
      ops: 'http://192.168.1.10/ops',
      opsSetup: 'http://192.168.1.10/ops/setup',
      portal: 'http://192.168.1.10/portal',
    },
  });
  let release!: (status: HostStatus) => void;
  let started!: () => void;
  const pending = new Promise<HostStatus>((resolve) => {
    release = resolve;
  });
  const startedPromise = new Promise<void>((resolve) => {
    started = resolve;
  });
  let calls = 0;
  const controller = createHostRefreshController({
    api: () =>
      mockApi({
        fetchSetupStatus: async () => {
          calls++;
          if (calls === 1) return enabled;
          if (calls === 2) {
            started();
            return pending;
          }
          return disabled;
        },
        // A restarting stack may not expose enough runtime data to detect the
        // config mismatch. The foreground refresh must still win.
        fetchRuntimeHealth: async () => minimalRuntime({ appBaseUrl: null, proxyServer: null }),
      }),
    onConfig: () => {},
    onRuntime: () => {},
    onError: () => {},
    schedule: () => 0,
    clearSchedule: () => {},
  });
  await controller.refresh({ scope: 'config' });
  const mutationRefresh = controller.refresh({ scope: 'config' });
  await startedPromise;
  const poll = controller.refresh({ scope: 'runtime', silent: true });
  release(disabled);
  await Promise.all([mutationRefresh, poll]);
  assert.equal(calls, 2);
  assert.equal(controller.getLastConfig()?.appBaseUrl, 'http://192.168.1.10:8080');
  assert.equal(controller.getLastConfig()?.proxy.enabled, false);
  assert.equal(
    controller.getLastConfig()?.deviceUrls?.terminal,
    'http://192.168.1.10:8080/terminal',
  );
});

test('portal-only lifecycle change requests authoritative config without merging runtime into it', async () => {
  const initial = minimalHostStatus();
  initial.lifecycleKey = 'before-portal-commit';
  const next = { ...initial, lifecycleKey: 'after-portal-commit' };
  let fetches = 0;
  const controller = createHostRefreshController({
    api: () =>
      mockApi({
        fetchSetupStatus: async () => (++fetches === 1 ? initial : next),
        fetchRuntimeHealth: async () => minimalRuntime({ lifecycleKey: 'after-portal-commit' }),
      }),
    onConfig: () => {},
    onRuntime: () => {},
    onError: () => {},
    schedule: () => 0,
    clearSchedule: () => {},
  });
  await controller.refresh({ scope: 'config' });
  await controller.refresh({ scope: 'runtime', silent: true });
  assert.equal(fetches, 2);
  assert.equal(controller.getLastConfig(), next);
  assert.equal(initial.lifecycleKey, 'before-portal-commit');
});
