import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatFreshclamAttemptLog,
  mergeSandboxWithClamAvLogs,
  parseSandboxScannerStatus,
  resolveMaxSignatureAgeHours,
} from './sandbox-health.js';

test('resolveMaxSignatureAgeHours falls back to 24h', () => {
  assert.equal(resolveMaxSignatureAgeHours(new Map()), 24);
  assert.equal(resolveMaxSignatureAgeHours(new Map([['CLAMAV_MAX_SIGNATURE_AGE_HOURS', '24']])), 24);
});

test('formatFreshclamAttemptLog formats last-attempt record with stderr message', () => {
  const formatted = formatFreshclamAttemptLog(
    JSON.stringify({
      attemptedAt: '2026-06-25T15:58:56.000Z',
      ok: false,
      exitCode: 9,
      source: 'startup',
      message:
        'ERROR: No DatabaseMirror or PrivateMirror servers set in freshclam config file.',
    }),
  );

  assert.match(formatted ?? '', /Letzter Versuch: 2026-06-25T15:58:56.000Z/);
  assert.match(formatted ?? '', /beim Start/);
  assert.match(formatted ?? '', /Exit-Code: 9/);
  assert.match(formatted ?? '', /fehlgeschlagen/);
  assert.match(formatted ?? '', /DatabaseMirror/);
});

test('mergeSandboxWithClamAvLogs appends ClamAV section after compose output', () => {
  const merged = mergeSandboxWithClamAvLogs(
    'praxis-flow-sandbox  | [sandbox] server started',
    'Letzter Versuch: 2026-06-25T15:58:56.000Z\nERROR: mirror unreachable',
  );
  assert.match(merged, /server started/);
  assert.match(merged, /--- ClamAV \(Signaturen\) ---/);
  assert.match(merged, /mirror unreachable/);
});

test('parseSandboxScannerStatus maps ready payload', () => {
  const status = parseSandboxScannerStatus(
    {
      status: 'degraded',
      scanner: {
        enabled: true,
        ready: false,
        signaturesFreshEnough: false,
        definitionsUpdatedAt: null,
        definitionsAgeHours: null,
        engineVersion: 'ClamAV 1.4.1',
        freshclamLastAttemptAt: '2026-06-25T15:58:56.000Z',
        freshclamLastAttemptOk: false,
        freshclamLastAttemptMessage: 'WARNING: rate limited',
        freshclamLastAttemptSource: 'startup',
        freshclamLogTail: 'ClamAV update process started',
      },
    },
    24,
  );

  assert.ok(status);
  assert.equal(status?.freshclamLastAttemptOk, false);
  assert.equal(status?.freshclamLastAttemptSource, 'startup');
  assert.match(status?.freshclamLastAttemptMessage ?? '', /rate limited/);
});
