import assert from 'node:assert/strict';
import test from 'node:test';
import type { HostStatus } from '../shared/host-status.js';
import { hostNetworkChanged, shouldOfferManualLanIpEntry } from './host-network-panels.js';

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
      authBridgeUrl: 'http://172.17.0.1:9100',
    },
    deviceUrls: null,
    probes: [],
    compose: null,
    sandboxScanner: null,
    networkBindings: [],
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

test('hostNetworkChanged detects LAN IP change', () => {
  const status = minimalStatus();
  assert.equal(
    hostNetworkChanged(
      {
        lanAppIp: '192.168.1.20',
        customLanIp: '',
        gatewayEnabled: true,
        gatewayInterface: 'eth1',
        gatewayIp: '192.168.88.1',
        portalAppIp: '192.168.1.10',
        authBridgeUrl: 'http://172.17.0.1:9100',
      },
      status,
    ),
    true,
  );
});

test('hostNetworkChanged is false when fields match status', () => {
  const status = minimalStatus();
  assert.equal(
    hostNetworkChanged(
      {
        lanAppIp: '192.168.1.10',
        customLanIp: '',
        gatewayEnabled: true,
        gatewayInterface: 'eth1',
        gatewayIp: '192.168.88.1',
        portalAppIp: '192.168.1.10',
        authBridgeUrl: 'http://172.17.0.1:9100',
      },
      status,
    ),
    false,
  );
});

test('hostNetworkChanged detects gateway bridge URL change', () => {
  const status = minimalStatus();
  assert.equal(
    hostNetworkChanged(
      {
        lanAppIp: '192.168.1.10',
        customLanIp: '',
        gatewayEnabled: true,
        gatewayInterface: 'eth1',
        gatewayIp: '192.168.88.1',
        portalAppIp: '192.168.1.10',
        authBridgeUrl: 'http://10.0.0.2:9100',
      },
      status,
    ),
    true,
  );
});

test('shouldOfferManualLanIpEntry hides manual path for single fresh candidate', () => {
  assert.equal(shouldOfferManualLanIpEntry(1, false), false);
});

test('shouldOfferManualLanIpEntry offers manual path when stale or ambiguous', () => {
  assert.equal(shouldOfferManualLanIpEntry(1, true), true);
  assert.equal(shouldOfferManualLanIpEntry(2, false), true);
  assert.equal(shouldOfferManualLanIpEntry(0, false), true);
});
