import assert from 'node:assert/strict';
import test from 'node:test';
import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';
import { minimalHostStatus } from './test-fixtures/minimal-host-status.js';
import {
  effectiveAppBaseUrl,
  effectiveCompose,
  effectiveConfiguredLanIp,
  effectiveDocker,
  effectiveEnvExists,
  effectiveProbes,
  effectiveProxyContainer,
  effectiveSandboxScanner,
} from './host-snapshot-selectors.js';

function minimalRuntime(overrides: Partial<HostRuntimeHealth> = {}): HostRuntimeHealth {
  const status = minimalHostStatus();
  return {
    checkedAt: '2026-07-21T12:00:00.000Z',
    envExists: status.envExists,
    configuredLanIp: status.network.configuredLanIp,
    appBaseUrl: status.appBaseUrl,
    docker: status.docker,
    compose: status.compose,
    probes: status.probes,
    sandboxScanner: status.sandboxScanner,
    proxyServer: null,
    ...overrides,
  };
}

test('effectiveCompose prefers runtime over config', () => {
  const config = minimalHostStatus({
    compose: { running: true, services: [] },
  });
  const runtime = minimalRuntime({
    compose: { running: false, services: [] },
  });
  assert.equal(effectiveCompose(config, runtime)?.running, false);
  assert.equal(effectiveCompose(config, null)?.running, true);
  assert.equal(effectiveCompose(null, runtime)?.running, false);
  assert.equal(effectiveCompose(null, null), null);
});

test('effectiveDocker / probes / scanner / env prefer runtime', () => {
  const config = minimalHostStatus({
    envExists: true,
    docker: { installed: true, daemonRunning: false, composeAvailable: true, detail: null },
    probes: [{ id: 'config', ok: true, message: 'c' }],
    sandboxScanner: null,
  });
  const runtimeScanner = {
    enabled: true,
    ready: true,
    signaturesFreshEnough: true,
    definitionsUpdatedAt: null,
    definitionsAgeHours: 1,
    maxSignatureAgeHours: 24,
    engineVersion: null,
    healthStatus: 'ready' as const,
    freshclamLastAttemptAt: null,
    freshclamLastAttemptOk: null,
    freshclamLastAttemptMessage: null,
    freshclamLastAttemptSource: null,
    freshclamLogTail: null,
  };
  const runtime = minimalRuntime({
    envExists: false,
    docker: { installed: true, daemonRunning: true, composeAvailable: true, detail: null },
    probes: [{ id: 'runtime', ok: false, message: 'r' }],
    sandboxScanner: runtimeScanner,
  });

  assert.equal(effectiveEnvExists(config, runtime), false);
  assert.equal(effectiveDocker(config, runtime)?.daemonRunning, true);
  assert.equal(effectiveProbes(config, runtime)[0]?.id, 'runtime');
  assert.equal(effectiveSandboxScanner(config, runtime), runtimeScanner);
});

test('effectiveConfiguredLanIp prefers runtime including null; appBaseUrl falls back on null', () => {
  const config = minimalHostStatus({
    appBaseUrl: 'http://config:8080',
    network: { configuredLanIp: '192.168.1.10', currentLanCandidates: [], lanIpStale: false },
  });
  const runtime = minimalRuntime({
    configuredLanIp: null,
    appBaseUrl: null,
  });
  assert.equal(effectiveConfiguredLanIp(config, runtime), null);
  // Same nullish semantics as the former shell merge for appBaseUrl.
  assert.equal(effectiveAppBaseUrl(config, runtime), 'http://config:8080');
  assert.equal(effectiveConfiguredLanIp(config, null), '192.168.1.10');
  assert.equal(effectiveAppBaseUrl(config, null), 'http://config:8080');
});

test('effectiveProxyContainer: runtime snapshot wins including proxyServer null', () => {
  const config = minimalHostStatus({
    proxy: {
      enabled: true,
      mode: 'http',
      canonicalBaseUrl: 'http://192.168.1.10',
      httpPort: 80,
      appBindAddress: '127.0.0.1',
      container: {
        name: 'config-proxy',
        service: 'proxy',
        state: 'exited',
        health: null,
      },
    },
  });
  const runtime = minimalRuntime({
    proxyServer: {
      enabled: true,
      container: {
        name: 'runtime-proxy',
        service: 'proxy',
        state: 'running',
        health: 'healthy',
      },
    },
  });
  assert.equal(effectiveProxyContainer(config, runtime)?.name, 'runtime-proxy');
  assert.equal(effectiveProxyContainer(config, minimalRuntime({ proxyServer: null })), null);
  assert.equal(
    effectiveProxyContainer(
      config,
      minimalRuntime({ proxyServer: { enabled: true, container: null } }),
    ),
    null,
  );
  assert.equal(effectiveProxyContainer(config, null)?.name, 'config-proxy');
});
