import assert from 'node:assert/strict';
import test from 'node:test';
import { CONFIGURED_GATEWAY, minimalHostStatus } from './test-fixtures/minimal-host-status.js';
import {
  hostNetworkChanged,
  networkDraftChanged,
  networkDraftEquals,
  shouldOfferManualLanIpEntry,
  snapshotNetworkDraft,
} from './host-network-panels.js';

const matchingDraft = {
  lanAppIp: '192.168.1.10',
  customLanIp: '',
  proxyEnabled: false,
};

test('hostNetworkChanged detects LAN IP change', () => {
  const status = minimalHostStatus();
  assert.equal(
    hostNetworkChanged(
      {
        ...matchingDraft,
        lanAppIp: '192.168.1.20',
      },
      status,
    ),
    true,
  );
});

test('networkDraftChanged is false when fields match status', () => {
  const status = minimalHostStatus({
    configuredCanonicalBaseUrl: 'http://192.168.1.10:8080',
    gateway: null,
  });
  assert.equal(networkDraftChanged(matchingDraft, status), false);
  assert.equal(hostNetworkChanged(matchingDraft, status), false);
});

test('legacy gateway: draft unchanged but apply still needed', () => {
  const status = minimalHostStatus({
    configuredCanonicalBaseUrl: 'http://192.168.1.10:8080',
    gateway: CONFIGURED_GATEWAY,
  });
  assert.equal(networkDraftChanged(matchingDraft, status), false);
  assert.equal(hostNetworkChanged(matchingDraft, status), true);
});

test('networkDraftEquals ignores HostStatus and gateway', () => {
  const a = snapshotNetworkDraft(matchingDraft);
  const b = snapshotNetworkDraft({ ...matchingDraft, proxyEnabled: true });
  assert.equal(networkDraftEquals(a, matchingDraft), true);
  assert.equal(networkDraftEquals(a, b), false);
});

test('hostNetworkChanged detects proxy toggle', () => {
  const status = minimalHostStatus({ configuredCanonicalBaseUrl: 'http://192.168.1.10:8080' });
  assert.equal(
    hostNetworkChanged(
      {
        ...matchingDraft,
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
