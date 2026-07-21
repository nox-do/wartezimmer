import assert from 'node:assert/strict';
import test from 'node:test';
import type { HostNetworkInput, HostNetworkResult, NetworkSnapshot } from '../shared/host-status.js';
import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
import { minimalHostStatus } from './test-fixtures/minimal-host-status.js';
import { createNetworkController } from './network-controller.js';
import { NETWORK_RESTART_CONFIRM_MESSAGE } from './network-view-model.js';

const emptyNetwork: NetworkSnapshot = {
  lanCandidates: [],
  interfaces: [],
  machineHostname: 'praxis-mac',
  gatewayComposeSupported: true,
};

function mockApi(overrides: Partial<PraxisManagerApi> = {}): PraxisManagerApi {
  return {
    fetchSetupNetwork: async () => emptyNetwork,
    ...overrides,
  } as PraxisManagerApi;
}

function saveResult(overrides: Partial<HostNetworkResult> = {}): HostNetworkResult {
  return {
    envPath: '/tmp/.env',
    backupPath: null,
    keysWritten: [],
    deviceUrls: {
      appBaseUrl: 'http://192.168.1.20',
      terminal: '',
      tv: '',
      mfa: '',
      ops: '',
      opsSetup: '',
      portal: '',
    },
    gatewayComposeSkipped: false,
    composeRestarted: true,
    stackWasRunning: true,
    compose: { running: true, services: [] },
    restartLog: null,
    ...overrides,
  };
}

test('show ignores stale fetchSetupNetwork after hide and after newer show', async () => {
  let resolveSlow: (value: NetworkSnapshot) => void = () => {};
  const slowPromise = new Promise<NetworkSnapshot>((resolve) => {
    resolveSlow = resolve;
  });
  const controller = createNetworkController({
    api: mockApi({
      fetchSetupNetwork: () => slowPromise,
    }),
    requestConfirm: () => {},
  });

  controller.show(minimalHostStatus());
  controller.hide();
  resolveSlow({ ...emptyNetwork, machineHostname: 'stale' });
  await slowPromise;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.getState().operation, 'idle');

  let resolveA: (value: NetworkSnapshot) => void = () => {};
  let resolveB: (value: NetworkSnapshot) => void = () => {};
  const promiseA = new Promise<NetworkSnapshot>((resolve) => {
    resolveA = resolve;
  });
  const promiseB = new Promise<NetworkSnapshot>((resolve) => {
    resolveB = resolve;
  });
  let call = 0;
  const racing = createNetworkController({
    api: mockApi({
      fetchSetupNetwork: () => {
        call += 1;
        return call === 1 ? promiseA : promiseB;
      },
    }),
    requestConfirm: () => {},
  });
  racing.show(minimalHostStatus({ practiceDisplayName: 'A' }));
  racing.show(minimalHostStatus({ practiceDisplayName: 'B' }));
  resolveB({ ...emptyNetwork, machineHostname: 'host-b' });
  await promiseB;
  await new Promise((resolve) => setTimeout(resolve, 0));
  resolveA({ ...emptyNetwork, machineHostname: 'host-a' });
  await promiseA;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(racing.getState().network?.machineHostname, 'host-b');
});

test('applyAndVerify is a no-op when unchanged', async () => {
  const saves: HostNetworkInput[] = [];
  const controller = createNetworkController({
    api: mockApi({
      saveHostNetwork: async (body) => {
        saves.push(body);
        return saveResult();
      },
    }),
    requestConfirm: () => {},
  });
  controller.show(minimalHostStatus());
  await Promise.resolve();
  controller.applyAndVerify();
  assert.equal(saves.length, 0);
  assert.equal(controller.getState().operation, 'idle');
});

test('applyAndVerify confirms restart then probes saved device URL', async () => {
  const confirms: string[] = [];
  const saves: HostNetworkInput[] = [];
  const probeUrls: string[] = [];
  const controller = createNetworkController({
    api: mockApi({
      saveHostNetwork: async (body) => {
        saves.push(body);
        return saveResult({ deviceUrls: { ...saveResult().deviceUrls, appBaseUrl: 'http://192.168.1.20' } });
      },
      runSetupProbes: async (body) => {
        if (body.lanAppBaseUrl) {
          probeUrls.push(body.lanAppBaseUrl);
        }
        return {
          probes: [
            { id: 'app.health.local', ok: true, message: 'ok' },
            { id: 'app.health.lan', ok: true, message: 'ok' },
          ],
        };
      },
    }),
    requestConfirm: (message, onConfirm) => {
      confirms.push(message);
      onConfirm();
    },
  });

  controller.show(
    minimalHostStatus({
      configuredCanonicalBaseUrl: 'http://192.168.1.10:8080',
      compose: { running: true, services: [] },
      network: {
        configuredLanIp: '192.168.1.10',
        currentLanCandidates: [{ address: '192.168.1.10', interfaceName: 'en0' }],
        lanIpStale: false,
      },
    }),
  );
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.patchFields({ lanAppIp: '192.168.1.20' });
  controller.applyAndVerify();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(confirms, [NETWORK_RESTART_CONFIRM_MESSAGE]);
  assert.equal(saves.length, 1);
  assert.equal(saves[0]?.restartCompose, true);
  assert.deepEqual(probeUrls, ['http://192.168.1.20']);
  assert.equal(controller.getState().operation, 'success');
  assert.match(controller.getState().resultMessage ?? '', /erreichbar: http:\/\/192\.168\.1\.20/);
});

test('verifyActiveConfiguration uses the provided saved URL only', async () => {
  const probeUrls: string[] = [];
  const controller = createNetworkController({
    api: mockApi({
      runSetupProbes: async (body) => {
        if (body.lanAppBaseUrl) {
          probeUrls.push(body.lanAppBaseUrl);
        }
        return {
          probes: [
            { id: 'app.health.local', ok: true, message: 'ok' },
            { id: 'app.health.lan', ok: false, message: 'down' },
          ],
        };
      },
    }),
    requestConfirm: () => {},
    verifyProbeOptions: { lanGraceMs: 0, intervalMs: 1, maxWaitMs: 50 },
  });
  controller.show(
    minimalHostStatus({ configuredCanonicalBaseUrl: 'http://192.168.1.10:8080' }),
  );
  await Promise.resolve();
  controller.verifyActiveConfiguration('http://192.168.1.10:8080');
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(probeUrls, ['http://192.168.1.10:8080']);
  assert.equal(controller.getState().operation, 'failed');
  assert.match(controller.getState().resultMessage ?? '', /nicht über das Praxisnetz/);
});

test('verifyActiveConfiguration sets failed when probe API rejects', async () => {
  const controller = createNetworkController({
    api: mockApi({
      runSetupProbes: async () => {
        throw new Error('setup unavailable');
      },
    }),
    requestConfirm: () => {},
    verifyProbeOptions: { lanGraceMs: 0, intervalMs: 1, maxWaitMs: 50 },
  });
  controller.show(
    minimalHostStatus({ configuredCanonicalBaseUrl: 'http://192.168.1.10:8080' }),
  );
  await Promise.resolve();
  controller.verifyActiveConfiguration('http://192.168.1.10:8080');
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.getState().operation, 'failed');
  assert.match(controller.getState().resultMessage ?? '', /konnte nicht geprüft werden/);
});

test('applyAndVerify treats restart failure as error', async () => {
  const controller = createNetworkController({
    api: mockApi({
      saveHostNetwork: async () =>
        saveResult({
          composeRestarted: false,
          stackWasRunning: true,
          restartLog: 'compose up failed',
          compose: { running: false, services: [] },
        }),
      runSetupProbes: async () => {
        throw new Error('probe must not run');
      },
    }),
    requestConfirm: (_message, onConfirm) => {
      onConfirm();
    },
  });
  controller.show(
    minimalHostStatus({
      configuredCanonicalBaseUrl: 'http://192.168.1.10:8080',
      compose: { running: true, services: [] },
      network: {
        configuredLanIp: '192.168.1.10',
        currentLanCandidates: [{ address: '192.168.1.10', interfaceName: 'en0' }],
        lanIpStale: false,
      },
    }),
  );
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.patchFields({ lanAppIp: '192.168.1.20' });
  controller.applyAndVerify();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.getState().operation, 'failed');
  assert.match(controller.getState().error ?? '', /nicht neu gestartet/);
});

test('restoreProxy treats failed start as error even when stack was stopped', async () => {
  const controller = createNetworkController({
    api: mockApi({
      saveHostNetwork: async (body) => {
        assert.equal(body.repairProxy, true);
        assert.equal(body.restartCompose, true);
        return saveResult({
          composeRestarted: false,
          stackWasRunning: false,
          compose: { running: false, services: [] },
        });
      },
      runSetupProbes: async () => {
        throw new Error('probe must not run');
      },
    }),
    requestConfirm: (_message, onConfirm) => {
      onConfirm();
    },
  });
  controller.show(
    minimalHostStatus({
      configuredCanonicalBaseUrl: 'http://192.168.1.10',
      compose: { running: false, services: [] },
      proxy: {
        enabled: true,
        mode: 'http',
        canonicalBaseUrl: 'http://192.168.1.10',
        httpPort: 80,
        appBindAddress: '127.0.0.1',
        container: null,
      },
      network: {
        configuredLanIp: '192.168.1.10',
        currentLanCandidates: [{ address: '192.168.1.10', interfaceName: 'en0' }],
        lanIpStale: false,
      },
    }),
  );
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.patchFields({ proxyEnabled: true });
  controller.restoreProxy();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.getState().operation, 'failed');
  assert.match(controller.getState().error ?? '', /Proxy-Dienst konnte nicht gestartet/);
});

test('hide during probe leaves operation idle without stale success', async () => {
  let resolveProbe: (value: {
    probes: { id: string; ok: boolean; message: string }[];
  }) => void = () => {};
  const probePromise = new Promise<{
    probes: { id: string; ok: boolean; message: string }[];
  }>((resolve) => {
    resolveProbe = resolve;
  });
  const controller = createNetworkController({
    api: mockApi({
      runSetupProbes: () => probePromise,
    }),
    requestConfirm: () => {},
    verifyProbeOptions: { lanGraceMs: 0, intervalMs: 1, maxWaitMs: 5_000 },
  });
  controller.show(
    minimalHostStatus({ configuredCanonicalBaseUrl: 'http://192.168.1.10:8080' }),
  );
  await Promise.resolve();
  controller.verifyActiveConfiguration('http://192.168.1.10:8080');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.getState().operation, 'checking');
  controller.hide();
  resolveProbe({
    probes: [
      { id: 'app.health.local', ok: true, message: 'ok' },
      { id: 'app.health.lan', ok: true, message: 'ok' },
    ],
  });
  await probePromise;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.getState().operation, 'idle');
  assert.equal(controller.getState().resultMessage, null);
});

test('applyAndVerify without running stack saves and skips probe', async () => {
  const controller = createNetworkController({
    api: mockApi({
      saveHostNetwork: async () =>
        saveResult({
          composeRestarted: false,
          stackWasRunning: false,
          compose: { running: false, services: [] },
        }),
      runSetupProbes: async () => {
        throw new Error('probe must not run');
      },
    }),
    requestConfirm: () => {},
  });
  controller.show(
    minimalHostStatus({
      configuredCanonicalBaseUrl: 'http://192.168.1.10:8080',
      compose: { running: false, services: [] },
      network: {
        configuredLanIp: '192.168.1.10',
        currentLanCandidates: [{ address: '192.168.1.10', interfaceName: 'en0' }],
        lanIpStale: false,
      },
    }),
  );
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.patchFields({ lanAppIp: '192.168.1.20' });
  controller.applyAndVerify();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.getState().operation, 'success');
  assert.match(controller.getState().resultMessage ?? '', /sobald Praxis Flow gestartet/);
});
