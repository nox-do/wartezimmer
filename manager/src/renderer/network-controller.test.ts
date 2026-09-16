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
  onAfterMutation?: () => void | Promise<void>;
  onStateChange?: () => void;
  isPeerMutating?: () => boolean;
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
    onStateChange: options.onStateChange,
    isPeerMutating: options.isPeerMutating,
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

test('TLS cutover network save omits HTTP identity fields', () => {
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
      acmeCnameTarget: null,
    },
  });
  assert.equal(hostNetworkMustPreserveTlsIdentity(config), true);

  const body = buildHostNetworkSaveInput({
    lanAppIp: '192.168.1.20',
    restartCompose: true,
    proxyEnabled: true,
    preserveTlsIdentity: true,
  });
  assert.equal('canonicalBaseUrl' in body, false);
  assert.equal(body.proxy, undefined);
});

test('TLS preparation network save omits proxy and canonical fields', () => {
  const config = minimalHostStatus({
    configuredCanonicalBaseUrl: 'http://192.168.1.10',
    tls: {
      state: 'awaiting-operator-dns',
      mode: 'managed',
      hostname: 'praxis.lan.notaus.de',
      installationId: '7fk3m2q9',
      tokenConsumed: false,
      applyReady: false,
      cutoverApplied: false,
      certificate: null,
      lastError: null,
      acmeCnameTarget: null,
    },
  });
  assert.equal(hostNetworkMustPreserveTlsIdentity(config), true);

  const body = buildHostNetworkSaveInput({
    lanAppIp: '192.168.1.20',
    restartCompose: true,
    proxyEnabled: true,
    preserveTlsIdentity: true,
  });
  assert.equal(body.lanAppIp, '192.168.1.20');
  assert.equal(body.restartCompose, true);
  assert.equal('canonicalBaseUrl' in body, false);
  assert.equal(body.proxy, undefined);
});

test('HTTP-only network save includes proxy and canonical fields', () => {
  const config = minimalHostStatus();
  assert.equal(hostNetworkMustPreserveTlsIdentity(config), false);

  const body = buildHostNetworkSaveInput({
    lanAppIp: '192.168.1.20',
    restartCompose: false,
    proxyEnabled: true,
    preserveTlsIdentity: false,
  });
  assert.equal('canonicalBaseUrl' in body, false);
  assert.deepEqual(body.proxy, { enabled: true, httpPort: 80 });
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
      acmeCnameTarget: null,
    },
  });
  assert.equal(
    networkDraftChanged(
      {
        lanAppIp: '__custom__',
        customLanIp: '192.168.1.10',
        proxyEnabled: false,
      },
      config,
    ),
    false,
  );
  assert.equal(
    networkDraftChanged(
      {
        lanAppIp: '__custom__',
        customLanIp: '192.168.1.20',
        proxyEnabled: false,
      },
      config,
    ),
    true,
  );
});

test('re-enabling proxy recreates a running stack whose healthcheck is still starting', async () => {
  const saves: HostNetworkInput[] = [];
  let confirmations = 0;
  const { controller } = createController({
    config: minimalHostStatus({
      compose: {
        running: false,
        services: [{ name: 'praxis-flow-app', service: 'app', state: 'running', health: 'starting' }],
      },
    }),
    requestConfirm: (_message, confirm) => {
      confirmations += 1;
      confirm();
    },
    api: {
      saveHostNetwork: async (input) => {
        saves.push(input);
        return saveResult({ composeRestarted: false });
      },
    },
  });
  controller.show();
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.patchFields({ proxyEnabled: true });
  controller.applyAndVerify();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(confirmations, 1);
  assert.equal(saves.length, 1);
  assert.equal(saves[0].restartCompose, true);
  assert.equal(saves[0].proxy?.enabled, true);
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
  assert.equal(hostNetworkChanged(controller.getState(), savedConfig), false);
});

test('failed network request refreshes persisted proxy configuration without tab navigation', async () => {
  const opening = minimalHostStatus();
  let savedConfig = opening;
  let displayedConfig = opening;
  const { controller, setConfig } = createController({
    config: opening,
    requestConfirm: (_message, confirm) => confirm(),
    api: {
      saveHostNetwork: async () => {
        savedConfig = {
          ...opening,
          proxy: { ...opening.proxy, enabled: true },
        };
        throw new Error('Zeitlimit beim Neustart');
      },
    },
    onAfterMutation: async () => {
      await Promise.resolve();
      displayedConfig = savedConfig;
      setConfig(savedConfig);
      controller.syncFromConfig();
    },
  });
  controller.show();
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.patchFields({ proxyEnabled: true });
  controller.applyAndVerify();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(displayedConfig.proxy.enabled, true);
  assert.equal(controller.getState().phase, 'idle');
  assert.match(JSON.stringify(controller.getState().notice), /Zeitlimit beim Neustart/);
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
  assert.equal(hostNetworkChanged(controller.getState(), afterSave), false);
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

test('patchFields notifies once and clears a leftover notice in the same patch', async () => {
  let calls = 0;
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
    },
    onStateChange: () => {
      calls += 1;
    },
  });
  controller.show();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.patchFields({ lanAppIp: '192.168.1.20' });
  controller.applyAndVerify();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(controller.getState().notice);

  calls = 0;
  controller.patchFields({ customLanIp: '10.0.0.2' });
  assert.equal(calls, 1);
  assert.equal(controller.getState().notice, null);
});

test('applyAndVerify does not save while TLS is mutating', async () => {
  const saves: HostNetworkInput[] = [];
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
        return saveResult();
      },
    },
    requestConfirm: (_message, onConfirm) => onConfirm(),
    isPeerMutating: () => true,
  });
  controller.show();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.patchFields({ lanAppIp: '192.168.1.20' });
  controller.applyAndVerify();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(saves.length, 0);
  assert.equal(controller.getState().phase, 'idle');
});

test('hide() clears the UI phase but keeps the host-write latch until saveHostNetwork settles', async () => {
  const held = { resolve() {} };
  const gate = new Promise<void>((resolve) => {
    held.resolve = resolve;
  });
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
      saveHostNetwork: async () => {
        await gate;
        return saveResult({
          composeRestarted: false,
          stackWasRunning: false,
          compose: { running: false, services: [] },
        });
      },
    },
  });
  controller.show();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.patchFields({ lanAppIp: '192.168.1.20' });
  controller.applyAndVerify();
  await Promise.resolve();
  assert.equal(controller.isHostWriteInFlight(), true);
  controller.hide();
  assert.equal(controller.getState().phase, 'idle');
  assert.equal(controller.isHostWriteInFlight(), true);
  held.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.isHostWriteInFlight(), false);
});

test('restoreProxy with active TLS preserves saved identity and does not call TLS issuance', async () => {
  const config = minimalHostStatus({
    configuredCanonicalBaseUrl: 'https://staff.example.test',
    appBaseUrl: 'https://staff.example.test',
  });
  config.proxy = {
    ...config.proxy,
    enabled: true,
    mode: 'http',
    container: null,
  };
  config.tls = {
    state: 'active',
    mode: 'managed',
    hostname: 'staff.example.test',
    installationId: 'example',
    tokenConsumed: true,
    applyReady: false,
    cutoverApplied: true,
    certificate: null,
    lastError: null,
    acmeCnameTarget: null,
  };
  let received: HostNetworkInput | null = null;
  const { controller } = createController({
    config,
    requestConfirm: (_message, confirm) => confirm(),
    api: {
      saveHostNetwork: async (body) => {
        received = body;
        return saveResult({ composeRestarted: false });
      },
      prepareHostTls: async () => {
        throw new Error('must not prepare TLS');
      },
      obtainHostTlsCertificate: async () => {
        throw new Error('must not issue a certificate');
      },
    },
  });
  controller.show();
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.restoreProxy();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(received);
  const body = received as HostNetworkInput;
  assert.equal(body.repairProxy, true);
  assert.equal('canonicalBaseUrl' in body, false);
  assert.equal(config.configuredCanonicalBaseUrl, 'https://staff.example.test');
  assert.equal(body.proxy, undefined);
  assert.equal(body.lanAppIp, config.network.configuredLanIp);
});

test('restoreProxy refuses unapplied address drafts', async () => {
  const config = minimalHostStatus();
  config.proxy = { ...config.proxy, enabled: true, mode: 'http', container: null };
  const { controller } = createController({
    config,
    requestConfirm: () => assert.fail('must not confirm'),
    api: {
      saveHostNetwork: async () => {
        throw new Error('must not mutate');
      },
    },
  });
  controller.show();
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.patchFields({ lanAppIp: '192.168.1.99' });
  controller.restoreProxy();
  assert.match(controller.getState().notice?.message ?? '', /Änderungen übernehmen oder verwerfen/);
});
