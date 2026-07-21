import assert from 'node:assert/strict';
import test from 'node:test';
import { minimalHostStatus } from './test-fixtures/minimal-host-status.js';
import { createNetworkController } from './network-controller.js';
import { NETWORK_NO_CHANGES_ERROR, NETWORK_PROXY_RESTORE_CONFIRM_MESSAGE, NETWORK_RESTART_CONFIRM_MESSAGE } from './network-view-model.js';

test('createNetworkController sets busy during show bootstrap', async () => {
  let resolveNetwork: (value: unknown) => void = () => {};
  const networkPromise = new Promise((resolve) => {
    resolveNetwork = resolve;
  });

  const controller = createNetworkController({
    api: {
      fetchSetupNetwork: () => networkPromise as never,
    } as never,
    requestConfirm: () => {},
  });

  controller.show(minimalHostStatus());
  assert.equal(controller.getState().busy, true);

  resolveNetwork({
    lanCandidates: [{ address: '192.168.1.10', interfaceName: 'en0' }],
    interfaces: [],
    machineHostname: 'praxis-mac',
    gatewayComposeSupported: true,
  });

  await networkPromise;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.getState().busy, false);
});

test('network bootstrap marks leftover enabled gateway as dirty', async () => {
  let resolveNetwork: (value: unknown) => void = () => {};
  const networkPromise = new Promise((resolve) => {
    resolveNetwork = resolve;
  });

  const controller = createNetworkController({
    api: {
      fetchSetupNetwork: () => networkPromise as never,
    } as never,
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
    lanCandidates: [{ address: '192.168.1.10', interfaceName: 'en0' }],
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

function mockApi(overrides: Partial<{ fetchSetupNetwork: () => Promise<unknown> }> = {}) {
  return {
    fetchSetupNetwork: () =>
      Promise.resolve({
        lanCandidates: [],
        interfaces: [],
        machineHostname: 'praxis-mac',
        gatewayComposeSupported: true,
      }),
    ...overrides,
  } as never;
}

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
  const saves: unknown[] = [];
  const controller = createNetworkController({
    api: {
      ...mockApi(),
      saveHostNetwork: async (body) => {
        saves.push(body);
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
        };
      },
    } as never,
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
  assert.equal((saves[0] as { repairProxy?: boolean }).repairProxy, true);
});
