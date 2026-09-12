import test from 'node:test';
import assert from 'node:assert/strict';
import type { SandboxScannerStatus } from '../shared/host-status.js';
import { sandboxClamAvChip } from './sandbox-scanner-ui.js';

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

test('sandboxClamAvChip prefers update failed over Signatures missing', () => {
  assert.deepEqual(
    sandboxClamAvChip(
      scanner({
        definitionsAgeHours: null,
        signaturesFreshEnough: false,
        ready: false,
        freshclamLastAttemptOk: false,
        freshclamLastAttemptMessage: 'Blocked by CDN',
      }),
    ),
    { label: 'update failed', ok: false, warn: true },
  );
});

test('sandboxClamAvChip: Signatures missing only without failed update attempt', () => {
  assert.deepEqual(
    sandboxClamAvChip(
      scanner({
        definitionsAgeHours: null,
        signaturesFreshEnough: false,
        ready: false,
        freshclamLastAttemptOk: null,
      }),
    ),
    { label: 'Signatures missing', ok: false, warn: true },
  );
});

test('sandboxClamAvChip: outdated is yellow', () => {
  assert.deepEqual(
    sandboxClamAvChip(
      scanner({ signaturesFreshEnough: false, definitionsAgeHours: 30, ready: false }),
    ),
    { label: 'outdated', ok: false, warn: true },
  );
});

test('sandboxClamAvChip: not started is red', () => {
  assert.deepEqual(sandboxClamAvChip(scanner({ engineVersion: null })), {
    label: 'not started',
    ok: false,
  });
});

test('sandboxClamAvChip: healthy', () => {
  assert.deepEqual(sandboxClamAvChip(scanner()), { label: 'ClamAV', ok: true });
});
