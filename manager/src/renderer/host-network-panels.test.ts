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
        reachabilityMode: 'lan-ip',
        customHostname: '',
        proxyEnabled: false,
      },
      status,
    ),
    true,
  );
});

test('hostNetworkChanged is false when fields match status', () => {
  const status = minimalHostStatus({
    configuredCanonicalBaseUrl: 'http://192.168.1.10:8080',
    gateway: null,
  });
  assert.equal(
    hostNetworkChanged(
      {
        lanAppIp: '192.168.1.10',
        customLanIp: '',
        reachabilityMode: 'lan-ip',
        customHostname: '',
        proxyEnabled: false,
      },
      status,
    ),
    false,
  );
});

test('hostNetworkChanged is true when leftover gateway is enabled', () => {
  const status = minimalHostStatus({
    configuredCanonicalBaseUrl: 'http://192.168.1.10:8080',
    gateway: CONFIGURED_GATEWAY,
  });
  assert.equal(
    hostNetworkChanged(
      {
        lanAppIp: '192.168.1.10',
        customLanIp: '',
        reachabilityMode: 'lan-ip',
        customHostname: '',
        proxyEnabled: false,
      },
      status,
    ),
    true,
  );
});

test('hostNetworkChanged detects proxy toggle', () => {
  const status = minimalHostStatus({ configuredCanonicalBaseUrl: 'http://192.168.1.10:8080' });
  assert.equal(
    hostNetworkChanged(
      {
        lanAppIp: '192.168.1.10',
        customLanIp: '',
        reachabilityMode: 'lan-ip',
        customHostname: '',
        proxyEnabled: true,
      },
      status,
    ),
    true,
  );
});

test('shouldOfferManualLanIpEntry hides manual path for single fresh candidate', () => {
  assert.equal(shouldOfferManualLanIpEntry(1, false), false);
});
