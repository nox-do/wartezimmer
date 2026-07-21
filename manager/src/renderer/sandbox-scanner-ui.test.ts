import test from 'node:test';
import assert from 'node:assert/strict';
import type { SandboxScannerStatus } from '../shared/host-status.js';
import { sandboxClamAvChip, sandboxScannerLevel } from './sandbox-scanner-ui.js';

function scanner(overrides: Partial<SandboxScannerStatus> = {}): SandboxScannerStatus {
  return {
    enabled: true,
    ready: true,
    signaturesFreshEnough: true,
    definitionsUpdatedAt: '2026-06-25T12:00:00.000Z',
    definitionsAgeHours: 2,
    maxSignatureAgeHours: 24,
    engineVersion: 'ClamAV 1.4.1',
    healthStatus: 'ready',
    freshclamLastAttemptAt: null,
    freshclamLastAttemptOk: null,
    freshclamLastAttemptMessage: null,
    freshclamLastAttemptSource: null,
    freshclamLogTail: null,
    ...overrides,
  };
}

test('sandboxScannerLevel marks missing definitions as bad', () => {
  assert.equal(sandboxScannerLevel(scanner({ definitionsAgeHours: null })), 'bad');
});

test('sandboxScannerLevel marks stale signatures as warn', () => {
  assert.equal(
    sandboxScannerLevel(
      scanner({ signaturesFreshEnough: false, definitionsAgeHours: 30, ready: false }),
    ),
    'warn',
  );
});

test('sandboxClamAvChip is red when definitions are missing', () => {
  assert.deepEqual(sandboxClamAvChip(scanner({ definitionsAgeHours: null })), {
    label: 'ClamAV',
    ok: false,
  });
});

test('sandboxClamAvChip is yellow when signatures are outdated', () => {
  assert.deepEqual(
    sandboxClamAvChip(
      scanner({ signaturesFreshEnough: false, definitionsAgeHours: 30, ready: false }),
    ),
    {
      label: 'ClamAV',
      ok: false,
      warn: true,
    },
  );
});
