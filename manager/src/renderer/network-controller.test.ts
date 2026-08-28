import assert from 'node:assert/strict';
import test from 'node:test';
import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';
import type {
  HostNetworkInput,
  HostNetworkResult,
  HostStatus,
  NetworkSnapshot,
} from '../shared/host-status.js';
import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
import { CONFIGURED_GATEWAY, minimalHostStatus } from './test-fixtures/minimal-host-status.js';
import { hostNetworkChanged, networkDraftChanged } from './host-network-panels.js';
import {
  buildHostNetworkSaveInput,
  createNetworkController,
  hostNetworkMustPreserveTlsIdentity,
} from './network-controller.js';
import { NETWORK_RESTART_CONFIRM_MESSAGE } from './network-view-model.js';

const emptyNetwork: NetworkSnapshot = {
  lanCandidates: [],
  interfaces: [],
  machineHostname: 'praxis-mac',
  gatewayComposeSupported: true,
};

function minimalRuntime(config: HostStatus): HostRuntimeHealth {
  return {
    checkedAt: '2026-07-21T12:00:00.000Z',
    envExists: config.envExists,
    configuredLanIp: config.network.configuredLanIp,
    appBaseUrl: config.appBaseUrl,
    docker: config.docker,
    compose: config.compose,
    probes: config.probes,
    sandboxScanner: config.sandboxScanner,
    proxyServer: config.proxy.enabled ? { enabled: true, container: config.proxy.container } : null,
  };
}

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

function createController(options: {
  config: HostStatus;
  runtime?: HostRuntimeHealth | null;
  api?: Partial<PraxisManagerApi>;
  requestConfirm?: (message: string, onConfirm: () => void) => void;
  verifyProbeOptions?: { maxWaitMs?: number; intervalMs?: number; lanGraceMs?: number };
  onAfterMutation?: () => void;
}) {
  let config = options.config;
  let runtime = options.runtime === undefined ? minimalRuntime(config) : options.runtime;
  const controller = createNetworkController({
    api: mockApi(options.api),
    getConfig: () => config,
    getRuntime: () => runtime,
    requestConfirm: options.requestConfirm ?? (() => {}),
    verifyProbeOptions: options.verifyProbeOptions,
    onAfterMutation: options.onAfterMutation,
  });
  return {
    controller,
    setConfig(next: HostStatus) {
      config = next;
    },
    setRuntime(next: HostRuntimeHealth | null) {
      runtime = next;
    },
  };
}

test('show ignores stale fetchSetupNetwork after hide and after newer show', async () => {
  let resolveSlow: (value: NetworkSnapshot) => void = () => {};
  const slowPromise = new Promise<NetworkSnapshot>((resolve) => {
    resolveSlow = resolve;
  });
  const { controller } = createController({
    config: minimalHostStatus(),
    api: { fetchSetupNetwork: () => slowPromise },
  });

  controller.show();
  controller.hide();
  resolveSlow({ ...emptyNetwork, machineHostname: 'stale' });
  await slowPromise;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.getState().phase, 'idle');

  let resolveA: (value: NetworkSnapshot) => void = () => {};
  let resolveB: (value: NetworkSnapshot) => void = () => {};
  const promiseA = new Promise<NetworkSnapshot>((resolve) => {
    resolveA = resolve;
  });
  const promiseB = new Promise<NetworkSnapshot>((resolve) => {
    resolveB = resolve;
  });
  let call = 0;
  let configB = minimalHostStatus({ practiceDisplayName: 'B' });
  const racing = createNetworkController({
    api: mockApi({
      fetchSetupNetwork: () => {
        call += 1;
        return call === 1 ? promiseA : promiseB;
      },
    }),
    getConfig: () => configB,
    getRuntime: () => minimalRuntime(configB),
    requestConfirm: () => {},
  });
  configB = minimalHostStatus({ practiceDisplayName: 'A' });
  racing.show();
  configB = minimalHostStatus({ practiceDisplayName: 'B' });
  racing.show();
  resolveB({ ...emptyNetwork, machineHostname: 'host-b' });
  await promiseB;
  await new Promise((resolve) => setTimeout(resolve, 0));
  resolveA({ ...emptyNetwork, machineHostname: 'host-a' });
  await promiseA;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(racing.getState().network?.machineHostname, 'host-b');
});

test('show uses config that arrives during fetchSetupNetwork', async () => {
  let resolveNetwork: (value: NetworkSnapshot) => void = () => {};
  const networkPromise = new Promise<NetworkSnapshot>((resolve) => {
    resolveNetwork = resolve;
  });
  const opening = minimalHostStatus({
    network: {
      configuredLanIp: '192.168.1.10',
      currentLanCandidates: [{ address: '192.168.1.10', interfaceName: 'en0' }],
      lanIpStale: false,
    },
  });
  const { controller, setConfig } = createController({
    config: opening,
    api: { fetchSetupNetwork: () => networkPromise },
  });
  controller.show();
  assert.equal(controller.getState().phase, 'loading');
  assert.equal(controller.getState().lanAppIp, '192.168.1.10');

  setConfig(
    minimalHostStatus({
      configuredCanonicalBaseUrl: 'http://192.168.1.55:8080',
      network: {
        configuredLanIp: '192.168.1.55',
        currentLanCandidates: [{ address: '192.168.1.55', interfaceName: 'en0' }],
        lanIpStale: false,
      },
    }),
  );
  controller.syncFromConfig(); // pending while loading
  resolveNetwork(emptyNetwork);
  await networkPromise;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.getState().phase, 'idle');
  assert.equal(controller.getState().lanAppIp, '192.168.1.55');
});

test('applyAndVerify is a no-op when unchanged', async () => {
  const saves: HostNetworkInput[] = [];
  const { controller } = createController({
    config: minimalHostStatus(),
    api: {
      saveHostNetwork: async (body) => {
        saves.push(body);
        return saveResult();
      },
    },
  });
  controller.show();
  await Promise.resolve();
  controller.applyAndVerify();
  assert.equal(saves.length, 0);
  assert.equal(controller.getState().phase, 'idle');
});

test('active TLS network save omits HTTP identity fields', () => {
  const config = minimalHostStatus({
    configuredCanonicalBaseUrl: 'https://praxis.lan.notaus.de',
    tls: {
      state: 'active',
      mode: 'managed',
      hostname: 'praxis.lan.notaus.de',
      installationId: '7fk3m2q9',
      tokenConsumed: true,
      applyReady: false,
      cutoverApplied: true,
      certificate: null,
      lastError: null,
    },
  });
  assert.equal(hostNetworkMustPreserveTlsIdentity(config), true);

  const body = buildHostNetworkSaveInput({
    lanAppIp: '192.168.1.20',
    restartCompose: true,
    canonicalBaseUrl: 'https://praxis.lan.notaus.de',
    proxyEnabled: true,
    preserveTlsIdentity: true,
  });
  assert.equal(body.canonicalBaseUrl, undefined);
  assert.equal(body.proxy, undefined);
});

test('active TLS ignores HTTP reachability draft drift but keeps LAN drift', () => {
  const config = minimalHostStatus({
    configuredCanonicalBaseUrl: 'https://praxis.lan.notaus.de',
    tls: {
      state: 'active',
      mode: 'managed',
      hostname: 'praxis.lan.notaus.de',
      installationId: '7fk3m2q9',
      tokenConsumed: true,
      applyReady: false,
      cutoverApplied: true,
      certificate: null,
      lastError: null,
    },
  });
  assert.equal(
    networkDraftChanged(
      {
        lanAppIp: '__custom__',
        customLanIp: '192.168.1.10',
        reachabilityMode: 'custom',
        customHostname: 'wrong-http-name.example',
        proxyEnabled: false,
      },
      config,
      emptyNetwork,
    ),
    false,
  );
  assert.equal(
    networkDraftChanged(
      {
        lanAppIp: '__custom__',
        customLanIp: '192.168.1.20',
        reachabilityMode: 'custom',
        customHostname: 'wrong-http-name.example',
        proxyEnabled: false,
      },
      config,
      emptyNetwork,
    ),
    true,
  );
});

test('applyAndVerify confirms restart then probes saved device URL', async () => {
  const confirms: string[] = [];
  const saves: HostNetworkInput[] = [];
  const probeUrls: string[] = [];
  const { controller } = createController({
    config: minimalHostStatus({
      configuredCanonicalBaseUrl: 'http://192.168.1.10:8080',
      compose: { running: true, services: [] },
      network: {
        configuredLanIp: '192.168.1.10',
        currentLanCandidates: [{ address: '192.168.1.10', interfaceName: 'en0' }],
        lanIpStale: false,
      },
    }),
    api: {
      saveHostNetwork: async (body) => {
        saves.push(body);
        return saveResult({
          deviceUrls: { ...saveResult().deviceUrls, appBaseUrl: 'http://192.168.1.20' },
        });
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
    },
    requestConfirm: (message, onConfirm) => {
      confirms.push(message);
      onConfirm();
    },
  });

  controller.show();
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
  assert.equal(controller.getState().phase, 'idle');
  assert.equal(controller.getState().notice?.tone, 'success');
  assert.match(controller.getState().notice?.message ?? '', /erreichbar: http:\/\/192\.168\.1\.20/);
});

test('save then config during probe hydrates draft and clears apply dirty', async () => {
  let resolveProbe: (value: {
    probes: { id: string; ok: boolean; message: string }[];
  }) => void = () => {};
  const probePromise = new Promise<{
    probes: { id: string; ok: boolean; message: string }[];
  }>((resolve) => {
    resolveProbe = resolve;
  });

  const opening = minimalHostStatus({
    configuredCanonicalBaseUrl: 'http://192.168.1.10:8080',
    compose: { running: true, services: [] },
    network: {
      configuredLanIp: '192.168.1.10',
      currentLanCandidates: [{ address: '192.168.1.10', interfaceName: 'en0' }],
      lanIpStale: false,
    },
  });
  const savedConfig = minimalHostStatus({
    configuredCanonicalBaseUrl: 'http://192.168.1.20:8080',
    compose: { running: true, services: [] },
    network: {
      configuredLanIp: '192.168.1.20',
      currentLanCandidates: [
        { address: '192.168.1.10', interfaceName: 'en0' },
        { address: '192.168.1.20', interfaceName: 'en0' },
      ],
      lanIpStale: false,
    },
  });

  const { controller, setConfig } = createController({
    config: opening,
    api: {
      saveHostNetwork: async () =>
        saveResult({
          deviceUrls: { ...saveResult().deviceUrls, appBaseUrl: 'http://192.168.1.20:8080' },
        }),
      runSetupProbes: () => probePromise,
    },
    requestConfirm: (_message, onConfirm) => {
      onConfirm();
    },
    verifyProbeOptions: { lanGraceMs: 0, intervalMs: 1, maxWaitMs: 5_000 },
    onAfterMutation: () => {
      setConfig(savedConfig);
      controller.syncFromConfig();
    },
  });

  controller.show();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.patchFields({ lanAppIp: '192.168.1.20' });
  controller.applyAndVerify();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.getState().phase, 'checking');
  assert.equal(controller.getState().lanAppIp, '192.168.1.20');

  resolveProbe({
    probes: [
      { id: 'app.health.local', ok: true, message: 'ok' },
      { id: 'app.health.lan', ok: true, message: 'ok' },
    ],
  });
  await probePromise;
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(controller.getState().phase, 'idle');
  assert.equal(controller.getState().lanAppIp, '192.168.1.20');
  assert.equal(
    hostNetworkChanged(controller.getState(), savedConfig, controller.getState().network),
    false,
  );
});

test('verifyActiveConfiguration uses the provided saved URL only', async () => {
  const probeUrls: string[] = [];
  const { controller } = createController({
    config: minimalHostStatus({
      configuredCanonicalBaseUrl: 'http://192.168.1.10:8080',
      compose: { running: true, services: [] },
    }),
    api: {
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
    },
    verifyProbeOptions: { lanGraceMs: 0, intervalMs: 1, maxWaitMs: 50 },
  });
  controller.show();
  await Promise.resolve();
  controller.verifyActiveConfiguration('http://192.168.1.10:8080');
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(probeUrls, ['http://192.168.1.10:8080']);
  assert.equal(controller.getState().phase, 'idle');
  assert.equal(controller.getState().notice?.tone, 'error');
  assert.match(controller.getState().notice?.message ?? '', /nicht über das Praxisnetz/);
});

test('verifyActiveConfiguration sets error notice when probe API rejects', async () => {
  const { controller } = createController({
    config: minimalHostStatus({
      configuredCanonicalBaseUrl: 'http://192.168.1.10:8080',
      compose: { running: true, services: [] },
    }),
    api: {
      runSetupProbes: async () => {
        throw new Error('setup unavailable');
      },
    },
    verifyProbeOptions: { lanGraceMs: 0, intervalMs: 1, maxWaitMs: 50 },
  });
  controller.show();
  await Promise.resolve();
  controller.verifyActiveConfiguration('http://192.168.1.10:8080');
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.getState().phase, 'idle');
  assert.equal(controller.getState().notice?.tone, 'error');
  assert.match(controller.getState().notice?.message ?? '', /konnte nicht geprüft werden/);
});

test('applyAndVerify treats restart failure as error', async () => {
  const { controller } = createController({
    config: minimalHostStatus({
      configuredCanonicalBaseUrl: 'http://192.168.1.10:8080',
      compose: { running: true, services: [] },
      network: {
        configuredLanIp: '192.168.1.10',
        currentLanCandidates: [{ address: '192.168.1.10', interfaceName: 'en0' }],
        lanIpStale: false,
      },
    }),
    api: {
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
    },
    requestConfirm: (_message, onConfirm) => {
      onConfirm();
    },
  });
  controller.show();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.patchFields({ lanAppIp: '192.168.1.20' });
  controller.applyAndVerify();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.getState().phase, 'idle');
  assert.equal(controller.getState().notice?.tone, 'error');
  assert.match(controller.getState().notice?.message ?? '', /nicht neu gestartet/);
});

test('restoreProxy treats failed start as error even when stack was stopped', async () => {
  const { controller } = createController({
    config: minimalHostStatus({
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
    api: {
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
    },
    requestConfirm: (_message, onConfirm) => {
      onConfirm();
    },
  });
  controller.show();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.patchFields({ proxyEnabled: true });
  controller.restoreProxy();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.getState().phase, 'idle');
  assert.equal(controller.getState().notice?.tone, 'error');
  assert.match(controller.getState().notice?.message ?? '', /Proxy-Dienst konnte nicht gestartet/);
});

test('hide during probe leaves phase idle without stale success notice', async () => {
  let resolveProbe: (value: {
    probes: { id: string; ok: boolean; message: string }[];
  }) => void = () => {};
  const probePromise = new Promise<{
    probes: { id: string; ok: boolean; message: string }[];
  }>((resolve) => {
    resolveProbe = resolve;
  });
  const { controller } = createController({
    config: minimalHostStatus({
      configuredCanonicalBaseUrl: 'http://192.168.1.10:8080',
      compose: { running: true, services: [] },
    }),
    api: {
      runSetupProbes: () => probePromise,
    },
    verifyProbeOptions: { lanGraceMs: 0, intervalMs: 1, maxWaitMs: 5_000 },
  });
  controller.show();
  await Promise.resolve();
  controller.verifyActiveConfiguration('http://192.168.1.10:8080');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.getState().phase, 'checking');
  controller.hide();
  resolveProbe({
    probes: [
      { id: 'app.health.local', ok: true, message: 'ok' },
      { id: 'app.health.lan', ok: true, message: 'ok' },
    ],
  });
  await probePromise;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.getState().phase, 'idle');
  assert.equal(controller.getState().notice, null);
});

test('applyAndVerify without running stack saves and skips probe', async () => {
  const { controller } = createController({
    config: minimalHostStatus({
      configuredCanonicalBaseUrl: 'http://192.168.1.10:8080',
      compose: { running: false, services: [] },
      network: {
        configuredLanIp: '192.168.1.10',
        currentLanCandidates: [{ address: '192.168.1.10', interfaceName: 'en0' }],
        lanIpStale: false,
      },
    }),
    api: {
      saveHostNetwork: async () =>
        saveResult({
          composeRestarted: false,
          stackWasRunning: false,
          compose: { running: false, services: [] },
        }),
      runSetupProbes: async () => {
        throw new Error('probe must not run');
      },
    },
  });
  controller.show();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.patchFields({ lanAppIp: '192.168.1.20' });
  controller.applyAndVerify();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.getState().phase, 'idle');
  assert.equal(controller.getState().notice?.tone, 'warning');
  assert.match(controller.getState().notice?.message ?? '', /sobald Praxis Flow gestartet/);
});

test('restart failure keeps save marker so config refresh still hydrates', async () => {
  const opening = minimalHostStatus({
    configuredCanonicalBaseUrl: 'http://192.168.1.10:8080',
    compose: { running: true, services: [] },
    network: {
      configuredLanIp: '192.168.1.10',
      currentLanCandidates: [{ address: '192.168.1.10', interfaceName: 'en0' }],
      lanIpStale: false,
    },
  });
  // Server-normalized after env write (e.g. hostname mode / candidate pick).
  const afterSave = minimalHostStatus({
    configuredCanonicalBaseUrl: 'http://192.168.1.20:8080',
    compose: { running: false, services: [] },
    network: {
      configuredLanIp: '192.168.1.20',
      currentLanCandidates: [
        { address: '192.168.1.10', interfaceName: 'en0' },
        { address: '192.168.1.20', interfaceName: 'en0' },
      ],
      lanIpStale: false,
    },
  });

  const { controller, setConfig } = createController({
    config: opening,
    api: {
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
    },
    requestConfirm: (_message, onConfirm) => {
      onConfirm();
    },
    onAfterMutation: () => {
      setConfig(afterSave);
      controller.syncFromConfig();
    },
  });

  controller.show();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.patchFields({ lanAppIp: '192.168.1.20' });
  controller.applyAndVerify();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(controller.getState().notice?.tone, 'error');
  assert.match(controller.getState().notice?.message ?? '', /nicht neu gestartet/);
  assert.equal(controller.getState().lanAppIp, '192.168.1.20');
  assert.equal(
    hostNetworkChanged(controller.getState(), afterSave, controller.getState().network),
    false,
  );
});

test('dirty draft survives config refresh; discardDraft restores config', async () => {
  const base = minimalHostStatus({
    configuredCanonicalBaseUrl: 'http://192.168.1.10:8080',
    compose: { running: true, services: [] },
    network: {
      configuredLanIp: '192.168.1.10',
      currentLanCandidates: [{ address: '192.168.1.10', interfaceName: 'en0' }],
      lanIpStale: false,
    },
  });
  const { controller, setConfig } = createController({ config: base });
  controller.show();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.patchFields({ lanAppIp: '192.168.1.20' });

  setConfig(
    minimalHostStatus({
      ...base,
      network: {
        configuredLanIp: '192.168.1.99',
        currentLanCandidates: [{ address: '192.168.1.99', interfaceName: 'en0' }],
        lanIpStale: false,
      },
    }),
  );
  controller.syncFromConfig();
  assert.equal(controller.getState().lanAppIp, '192.168.1.20');

  controller.discardDraft();
  assert.equal(controller.getState().lanAppIp, '192.168.1.99');
});

test('legacy gateway baseline: untouched draft still syncs; apply stays needed', async () => {
  const withGateway = minimalHostStatus({
    configuredCanonicalBaseUrl: 'http://192.168.1.10:8080',
    gateway: CONFIGURED_GATEWAY,
    network: {
      configuredLanIp: '192.168.1.10',
      currentLanCandidates: [{ address: '192.168.1.10', interfaceName: 'en0' }],
      lanIpStale: false,
    },
  });
  const cleared = minimalHostStatus({
    configuredCanonicalBaseUrl: 'http://192.168.1.10:8080',
    gateway: null,
    network: {
      configuredLanIp: '192.168.1.10',
      currentLanCandidates: [{ address: '192.168.1.10', interfaceName: 'en0' }],
      lanIpStale: false,
    },
  });
  const { controller, setConfig } = createController({ config: withGateway });
  controller.show();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(networkDraftChanged(controller.getState(), withGateway), false);
  assert.equal(hostNetworkChanged(controller.getState(), withGateway), true);

  setConfig(cleared);
  controller.syncFromConfig();
  assert.equal(controller.getState().lanAppIp, '192.168.1.10');
  assert.equal(hostNetworkChanged(controller.getState(), cleared), false);
});
