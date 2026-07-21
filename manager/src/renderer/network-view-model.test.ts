import assert from 'node:assert/strict';
import test from 'node:test';
import type { HostNetworkResult } from '../shared/host-status.js';
import {
  formatActiveReachabilityResult,
  networkExpanderDefaults,
  networkHostChecksForDisplay,
  networkIsBusy,
  networkProxyMissingAfterRestart,
  networkRestartFailureMessage,
  networkSavedWhileStoppedMessage,
  proxyNeedsRestore,
  savedDeviceBaseUrl,
} from './network-view-model.js';
import { minimalHostStatus } from './test-fixtures/minimal-host-status.js';

test('networkIsBusy covers in-flight phases only', () => {
  assert.equal(networkIsBusy('idle'), false);
  assert.equal(networkIsBusy('success'), false);
  assert.equal(networkIsBusy('checking'), true);
  assert.equal(networkIsBusy('saving'), true);
});

test('formatActiveReachabilityResult prefers actionable messages', () => {
  assert.match(
    formatActiveReachabilityResult(
      [
        { id: 'app.health.local', ok: true, message: 'ok' },
        { id: 'app.health.lan', ok: true, message: 'ok' },
      ],
      'http://192.168.1.50',
    ).message,
    /erreichbar: http:\/\/192\.168\.1\.50/,
  );
  assert.match(
    formatActiveReachabilityResult(
      [
        { id: 'app.health.local', ok: true, message: 'ok' },
        { id: 'app.health.lan', ok: false, message: 'down' },
      ],
      'http://192.168.1.50',
    ).message,
    /nicht über das Praxisnetz/,
  );
});

test('networkRestartFailureMessage hides raw compose noise when empty', () => {
  const result = {
    composeRestarted: false,
    stackWasRunning: true,
    restartLog: null,
  } as HostNetworkResult;
  assert.match(networkRestartFailureMessage(result), /nicht neu gestartet/);
  assert.match(networkSavedWhileStoppedMessage(), /sobald Praxis Flow gestartet/);
});

test('networkProxyMissingAfterRestart detects enabled-but-missing container', () => {
  assert.equal(
    networkProxyMissingAfterRestart(
      {
        composeRestarted: true,
        compose: { running: true, services: [] },
      } as unknown as HostNetworkResult,
      true,
    ),
    true,
  );
});

test('proxyNeedsRestore and savedDeviceBaseUrl', () => {
  assert.equal(
    proxyNeedsRestore(
      minimalHostStatus({
        proxy: {
          enabled: true,
          mode: 'http',
          canonicalBaseUrl: 'http://192.168.1.10',
          httpPort: 80,
          appBindAddress: '127.0.0.1',
          container: null,
        },
      }),
    ),
    true,
  );
  assert.equal(
    savedDeviceBaseUrl(
      minimalHostStatus({ configuredCanonicalBaseUrl: 'http://192.168.1.10' }),
    ),
    'http://192.168.1.10',
  );
});

test('networkHostChecksForDisplay drops gateway leftover checks', () => {
  assert.deepEqual(
    networkHostChecksForDisplay([
      { id: 'lan.ip-on-host', ok: true, message: 'LAN ok' },
      { id: 'gateway.interface', ok: false, message: 'NIC fehlt' },
    ]).map((check) => check.id),
    ['lan.ip-on-host'],
  );
});

test('networkExpanderDefaults opens checks and proxy when degraded', () => {
  const defaults = networkExpanderDefaults({
    status: minimalHostStatus({
      networkBindings: [{ id: 'app.port', ok: false, message: 'down' }],
      proxy: {
        enabled: true,
        mode: 'http',
        canonicalBaseUrl: 'http://192.168.1.10',
        httpPort: 80,
        appBindAddress: '127.0.0.1',
        container: null,
      },
    }),
    proxyEnabled: true,
  });
  assert.equal(defaults.checksOpen, true);
  assert.equal(defaults.proxyOpen, true);
  assert.equal(defaults.topologyOpen, false);
});
