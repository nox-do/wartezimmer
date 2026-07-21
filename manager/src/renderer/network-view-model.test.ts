import assert from 'node:assert/strict';
import test from 'node:test';
import type { HostNetworkResult } from '../shared/host-status.js';
import {
  NETWORK_NO_CHANGES_ERROR,
  NETWORK_PROXY_RESTORE_CONFIRM_MESSAGE,
  networkSaveErrorText,
  networkSaveStatusText,
  networkWarningText,
  proxyNeedsRestore,
} from './network-view-model.js';
import { minimalHostStatus } from './test-fixtures/minimal-host-status.js';

function minimalSaveResult(overrides: Partial<HostNetworkResult> = {}): HostNetworkResult {
  return {
    envPath: '/tmp/praxis/.env',
    backupPath: '/tmp/praxis/.env.backup-1',
    keysWritten: ['SETUP_LAN_APP_IP'],
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
    compose: null,
    restartLog: null,
    ...overrides,
  };
}

test('networkWarningText warns when stack runs and fields changed', () => {
  assert.equal(
    networkWarningText(true, true),
    'Änderungen werden erst nach einem Stack-Neustart wirksam. Beim Übernehmen wird danach gefragt.',
  );
  assert.equal(networkWarningText(true, false), null);
  assert.equal(networkWarningText(false, true), null);
});

test('networkSaveStatusText summarizes save and restart outcome', () => {
  const text = networkSaveStatusText(minimalSaveResult(), true);
  assert.match(text, /gespeichert/);
  assert.match(text, /Backup:/);
  assert.match(text, /neu gestartet/);
});

test('networkSaveStatusText ignores gatewayComposeSkipped', () => {
  const text = networkSaveStatusText(minimalSaveResult({ gatewayComposeSkipped: true }), false);
  assert.doesNotMatch(text, /Gateway/);
  assert.match(text, /gespeichert/);
});

test('networkSaveErrorText surfaces restart failure log', () => {
  assert.equal(
    networkSaveErrorText(
      minimalSaveResult({ composeRestarted: false, restartLog: 'compose failed' }),
      true,
    ),
    'compose failed',
  );
  assert.equal(networkSaveErrorText(minimalSaveResult(), true), null);
});

test('NETWORK_NO_CHANGES_ERROR mentions LAN and proxy only', () => {
  assert.equal(NETWORK_NO_CHANGES_ERROR, 'Keine Änderungen an LAN oder Proxy-Server.');
});

test('networkSaveStatusText notes proxy when stack was stopped', () => {
  const text = networkSaveStatusText(
    minimalSaveResult({
      composeRestarted: false,
      stackWasRunning: false,
    }),
    false,
    { proxyEnabled: true },
  );
  assert.match(text, /Proxy aktiviert/);
  assert.match(text, /Stack unter Status starten/);
});

test('networkSaveStatusText notes running proxy after restart', () => {
  const text = networkSaveStatusText(
    minimalSaveResult({
      compose: {
        running: true,
        services: [
          {
            name: 'proxy',
            service: 'proxy',
            state: 'running',
            health: null,
            publishedPorts: [80],
          },
        ],
      },
    }),
    true,
    { proxyEnabled: true },
  );
  assert.match(text, /Proxy-Server läuft/);
});

test('proxyNeedsRestore is true when enabled without running container', () => {
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
    proxyNeedsRestore(
      minimalHostStatus({
        proxy: {
          enabled: true,
          mode: 'http',
          canonicalBaseUrl: 'http://192.168.1.10',
          httpPort: 80,
          appBindAddress: '127.0.0.1',
          container: {
            name: 'proxy',
            service: 'proxy',
            state: 'running',
            health: null,
            publishedPorts: [80],
          },
        },
      }),
    ),
    false,
  );
  assert.equal(proxyNeedsRestore(minimalHostStatus()), false);
});

test('networkSaveStatusText summarizes proxy restore', () => {
  const text = networkSaveStatusText(
    minimalSaveResult({
      composeRestarted: true,
      stackWasRunning: false,
      compose: {
        running: true,
        services: [
          {
            name: 'proxy',
            service: 'proxy',
            state: 'running',
            health: null,
            publishedPorts: [80],
          },
        ],
      },
    }),
    true,
    { proxyEnabled: true, repairingProxy: true },
  );
  assert.match(text, /Wiederherstellung/);
  assert.match(text, /Proxy-Server läuft/);
});
