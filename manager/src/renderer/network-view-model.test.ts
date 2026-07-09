import assert from 'node:assert/strict';
import test from 'node:test';
import type { HostNetworkResult } from '../shared/host-status.js';
import {
  NETWORK_NO_CHANGES_ERROR,
  networkSaveErrorText,
  networkSaveStatusText,
  networkWarningText,
} from './network-view-model.js';

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

test('networkSaveStatusText notes skipped gateway compose on macOS', () => {
  const text = networkSaveStatusText(minimalSaveResult({ gatewayComposeSkipped: true }), false);
  assert.match(text, /Gateway auf diesem Rechner übersprungen/);
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

test('NETWORK_NO_CHANGES_ERROR is stable copy', () => {
  assert.equal(NETWORK_NO_CHANGES_ERROR, 'Keine Änderungen an LAN oder Gateway.');
});
