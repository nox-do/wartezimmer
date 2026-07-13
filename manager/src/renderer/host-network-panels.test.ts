import assert from 'node:assert/strict';
import test from 'node:test';
import { CONFIGURED_GATEWAY, minimalHostStatus } from './test-fixtures/minimal-host-status.js';
import { hostNetworkChanged, shouldOfferManualLanIpEntry } from './host-network-panels.js';

test('hostNetworkChanged detects LAN IP change', () => {
  const status = minimalHostStatus();
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
        reachabilityMode: 'lan-ip',
        customHostname: '',
      },
      status,
    ),
    true,
  );
});

test('hostNetworkChanged is false when fields match status', () => {
  const status = minimalHostStatus({
    configuredCanonicalBaseUrl: 'http://192.168.1.10:8080',
    gateway: CONFIGURED_GATEWAY,
  });
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
        reachabilityMode: 'lan-ip',
        customHostname: '',
      },
      status,
    ),
    false,
  );
});

test('hostNetworkChanged detects canonical reachability change', () => {
  const status = minimalHostStatus({ configuredCanonicalBaseUrl: 'http://192.168.1.10:8080' });
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
        reachabilityMode: 'custom',
        customHostname: 'praxis-flow.local',
      },
      status,
    ),
    true,
  );
});

test('hostNetworkChanged detects gateway bridge URL change', () => {
  const status = minimalHostStatus({ configuredCanonicalBaseUrl: 'http://192.168.1.10:8080' });
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
        reachabilityMode: 'lan-ip',
        customHostname: '',
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
