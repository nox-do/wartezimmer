import test from 'node:test';
import assert from 'node:assert/strict';
import type { SandboxScannerStatus } from '../shared/host-status.js';
import {
  aggregatedServiceStateLabel,
  formatSandboxScannerDetail,
  sandboxClamAvChip,
  sandboxScannerLevel,
  sandboxScannerReachability,
} from './sandbox-scanner-ui.js';

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

test('formatSandboxScannerDetail omits freshclam log message on failure', () => {
  const detail = formatSandboxScannerDetail(
    scanner({
      definitionsAgeHours: null,
      signaturesFreshEnough: false,
      ready: false,
      freshclamLastAttemptAt: '2026-06-25T10:00:00.000Z',
      freshclamLastAttemptOk: false,
      freshclamLastAttemptMessage: 'WARNING: rate limited',
      freshclamLastAttemptSource: 'startup',
    }),
  );
  assert.match(detail ?? '', /Virendefinitionen fehlen/);
  assert.match(detail ?? '', /fehlgeschlagen/);
  assert.match(detail ?? '', /beim Start/);
  assert.doesNotMatch(detail ?? '', /rate limited/);
});

test('aggregatedServiceStateLabel replaces healthy when scanner is degraded', () => {
  const label = aggregatedServiceStateLabel(
    { name: 'sandbox', service: 'sandbox', state: 'running', health: 'healthy' },
    scanner({ definitionsAgeHours: null, signaturesFreshEnough: false, ready: false }),
  );
  assert.equal(label, 'running — unhealthy');
});

test('aggregatedServiceStateLabel keeps healthy when scanner is ok', () => {
  const label = aggregatedServiceStateLabel(
    { name: 'sandbox', service: 'sandbox', state: 'running', health: 'healthy' },
    scanner(),
  );
  assert.equal(label, 'running — healthy');
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

test('sandboxScannerReachability returns warn for stale signatures', () => {
  assert.equal(
    sandboxScannerReachability(
      scanner({ signaturesFreshEnough: false, definitionsAgeHours: 30, ready: false }),
    ),
    'warn',
  );
});
