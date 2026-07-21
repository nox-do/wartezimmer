import assert from 'node:assert/strict';
import test from 'node:test';
import type { HostNetworkInput, HostNetworkResult, NetworkSnapshot } from '../shared/host-status.js';
import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
import { minimalHostStatus } from './test-fixtures/minimal-host-status.js';
import { createNetworkController } from './network-controller.js';
import {
  NETWORK_NO_CHANGES_ERROR,
  NETWORK_PROXY_RESTORE_CONFIRM_MESSAGE,
  NETWORK_RESTART_CONFIRM_MESSAGE,
} from './network-view-model.js';

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
      appBaseUrl: '',
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

test('createNetworkController sets busy during show bootstrap', async () => {
  let resolveNetwork: (value: NetworkSnapshot) => void = () => {};
  const networkPromise = new Promise<NetworkSnapshot>((resolve) => {
    resolveNetwork = resolve;
  });

  const controller = createNetworkController({
    api: mockApi({
      fetchSetupNetwork: () => networkPromise,
    }),
    requestConfirm: () => {},
  });

  controller.show(minimalHostStatus());
  assert.equal(controller.getState().busy, true);

  resolveNetwork({
    lanCandidates: [{ address: '192.168.1.10', interfaceName: 'en0', label: 'en0' }],
    interfaces: [],
    machineHostname: 'praxis-mac',
    gatewayComposeSupported: true,
  });

  await networkPromise;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.getState().busy, false);
});

test('show ignores stale fetchSetupNetwork responses after hide', async () => {
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
  resolveSlow({
    ...emptyNetwork,
    machineHostname: 'stale-host',
  });
  await slowPromise;
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(controller.getState().network, null);
  assert.equal(controller.getState().busy, false);
});

test('show B wins when show A response arrives after show B', async () => {
  let resolveA: (value: NetworkSnapshot) => void = () => {};
  let resolveB: (value: NetworkSnapshot) => void = () => {};
  const promiseA = new Promise<NetworkSnapshot>((resolve) => {
    resolveA = resolve;
  });
  const promiseB = new Promise<NetworkSnapshot>((resolve) => {
    resolveB = resolve;
  });
  let call = 0;

  const controller = createNetworkController({
    api: mockApi({
      fetchSetupNetwork: () => {
        call += 1;
        return call === 1 ? promiseA : promiseB;
      },
    }),
    requestConfirm: () => {},
  });

  controller.show(minimalHostStatus({ practiceDisplayName: 'A' }));
  controller.show(minimalHostStatus({ practiceDisplayName: 'B' }));

  resolveB({ ...emptyNetwork, machineHostname: 'host-b' });
  await promiseB;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.getState().network?.machineHostname, 'host-b');
  assert.equal(controller.getState().busy, false);

  resolveA({ ...emptyNetwork, machineHostname: 'host-a-stale' });
  await promiseA;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.getState().network?.machineHostname, 'host-b');
});

test('network bootstrap marks leftover enabled gateway as dirty', async () => {
  let resolveNetwork: (value: NetworkSnapshot) => void = () => {};
  const networkPromise = new Promise<NetworkSnapshot>((resolve) => {
    resolveNetwork = resolve;
  });

  const controller = createNetworkController({
    api: mockApi({
      fetchSetupNetwork: () => networkPromise,
    }),
    requestConfirm: () => {},
  });

  controller.show(
    minimalHostStatus({
      configuredCanonicalBaseUrl: 'http://192.168.1.10:8080',
      network: {
        configuredLanIp: '192.168.1.10',
        currentLanCandidates: [{ address: '192.168.1.10', interfaceName: 'en0' }],
        lanIpStale: false,
      },
      gateway: {
        enabled: true,
        gatewayInterface: 'eth1',
        gatewayIp: '192.168.88.1',
        portalAppIp: '192.168.1.10',
        authBridgeUrl: '',
      },
    }),
  );

  resolveNetwork({
    lanCandidates: [{ address: '192.168.1.10', interfaceName: 'en0', label: 'en0' }],
    interfaces: [],
    machineHostname: 'praxis-mac',
    gatewayComposeSupported: true,
  });

  await networkPromise;
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(controller.getState().lanAppIp, '192.168.1.10');
  // Leftover GATEWAY_* must be treated as dirty so save can clear it.
  controller.apply();
  assert.notEqual(controller.getState().error, NETWORK_NO_CHANGES_ERROR);
});

test('apply rejects unchanged network fields', async () => {
  const controller = createNetworkController({
    api: mockApi(),
    requestConfirm: () => {},
  });

  controller.show(minimalHostStatus());
  await Promise.resolve();
  controller.apply();

  assert.equal(controller.getState().error, NETWORK_NO_CHANGES_ERROR);
});

test('apply requests restart confirm when stack runs and fields changed', async () => {
  const confirms: string[] = [];
  const controller = createNetworkController({
    api: mockApi(),
    requestConfirm: (message) => {
      confirms.push(message);
    },
  });

  const status = minimalHostStatus({
    compose: { running: true, services: [] },
  });
  controller.show(status);
  await Promise.resolve();
  controller.patchFields({ lanAppIp: '192.168.1.20' });
  controller.apply();

  assert.deepEqual(confirms, [NETWORK_RESTART_CONFIRM_MESSAGE]);
});

test('restoreProxy confirms repair when proxy container is missing', async () => {
  const confirms: string[] = [];
  const saves: HostNetworkInput[] = [];
  const controller = createNetworkController({
    api: mockApi({
      saveHostNetwork: async (body: HostNetworkInput) => {
        saves.push(body);
        return saveResult();
      },
    }),
    requestConfirm: (message, onConfirm) => {
      confirms.push(message);
      onConfirm();
    },
  });

  controller.show(
    minimalHostStatus({
      configuredCanonicalBaseUrl: 'http://192.168.1.10',
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

  controller.restoreProxy();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(confirms, [NETWORK_PROXY_RESTORE_CONFIRM_MESSAGE]);
  assert.equal(saves.length, 1);
  assert.equal(saves[0]?.repairProxy, true);
});
