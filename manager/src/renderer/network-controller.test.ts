import assert from 'node:assert/strict';
import test from 'node:test';
import type { HostStatus } from '../shared/host-status.js';
import { createNetworkController } from './network-controller.js';
import { NETWORK_NO_CHANGES_ERROR, NETWORK_RESTART_CONFIRM_MESSAGE } from './network-view-model.js';

function minimalStatus(overrides: Partial<HostStatus> = {}): HostStatus {
  return {
    installHome: '/tmp/praxis',
    mode: 'dev',
    composeProjectName: 'pf-praxis',
    projectRoot: '/tmp/praxis',
    envExists: true,
    envPath: '/tmp/praxis/.env',
    practiceDisplayName: 'Praxis',
    docker: {
      installed: true,
      daemonRunning: true,
      composeAvailable: true,
      detail: null,
    },
    folders: { imports: '/imports', exports: '/exports' },
    appBaseUrl: 'http://192.168.1.10:8080',
    configuredCanonicalBaseUrl: null,
    network: {
      configuredLanIp: '192.168.1.10',
      currentLanCandidates: [{ address: '192.168.1.10', interfaceName: 'en0' }],
      lanIpStale: false,
    },
    gateway: {
      enabled: false,
      gatewayInterface: 'eth1',
      gatewayIp: '192.168.88.1',
      portalAppIp: '192.168.1.10',
      authBridgeUrl: '',
    },
    deviceUrls: null,
    probes: [],
    compose: { running: false, services: [] },
    sandboxScanner: null,
    networkBindings: [],
    networkPrerequisites: [{ id: 'preflight.app-port', ok: true, message: 'Port 8080 ist frei' }],
    deliveryImages: {
      required: false,
      configured: false,
      appImage: null,
      sandboxImage: null,
      releaseVersion: null,
      archiveSha256: null,
      appPresent: false,
      sandboxPresent: false,
      ready: true,
    },
    ...overrides,
  };
}

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

  controller.show(minimalStatus());
  assert.equal(controller.getState().busy, true);

  resolveNetwork({
    lanCandidates: [{ address: '192.168.1.10', label: 'en0 — 192.168.1.10' }],
    interfaces: [],
    machineHostname: 'praxis-mac',
    gatewayComposeSupported: true,
    defaultGatewayBridgeUrl: 'http://172.17.0.1:9100',
  });

  await networkPromise;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.getState().busy, false);
});

test('network bootstrap fills gateway portal IP from selected LAN IP', async () => {
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
    minimalStatus({
      network: {
        configuredLanIp: null,
        currentLanCandidates: [],
        lanIpStale: false,
      },
      gateway: {
        enabled: true,
        gatewayInterface: 'eth1',
        gatewayIp: '192.168.88.1',
        portalAppIp: '',
        authBridgeUrl: '',
      },
    }),
  );
  controller.patchFields({ lanAppIp: '192.168.1.10', portalAppIp: '', authBridgeUrl: '' });

  resolveNetwork({
    lanCandidates: [{ address: '192.168.1.10', label: 'en0 — 192.168.1.10' }],
    interfaces: [],
    machineHostname: 'praxis-mac',
    gatewayComposeSupported: true,
    defaultGatewayBridgeUrl: 'http://172.17.0.1:9100',
  });

  await networkPromise;
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(controller.getState().portalAppIp, '192.168.1.10');
  assert.equal(controller.getState().authBridgeUrl, 'http://172.17.0.1:9100');
});

function mockApi(overrides: Partial<{ fetchSetupNetwork: () => Promise<unknown> }> = {}) {
  return {
    fetchSetupNetwork: () =>
      Promise.resolve({
        lanCandidates: [],
        interfaces: [],
        machineHostname: 'praxis-mac',
        gatewayComposeSupported: true,
        defaultGatewayBridgeUrl: 'http://172.17.0.1:9100',
      }),
    ...overrides,
  } as never;
}

test('apply rejects unchanged network fields', async () => {
  const controller = createNetworkController({
    api: mockApi(),
    requestConfirm: () => {},
  });

  controller.show(minimalStatus());
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

  const status = minimalStatus({
    compose: { running: true, services: [] },
  });
  controller.show(status);
  await Promise.resolve();
  controller.patchFields({ lanAppIp: '192.168.1.20' });
  controller.apply();

  assert.deepEqual(confirms, [NETWORK_RESTART_CONFIRM_MESSAGE]);
});
