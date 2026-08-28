import assert from 'node:assert/strict';
import test from 'node:test';
import type { PfbackupInspectResult } from '../shared/host-status.js';
import {
  canRetryRestoreAfterFailure,
  canSkipRestoreAfterFailure,
  isRestoreRollbackFailed,
  restoreInspectBlockedMessage,
  restoreInspectSummaryLines,
  restoreTlsInspectSummaryLine,
  restoreSuccessSummary,
  restoreWizardChooseLead,
  shouldOfferCredentialSkip,
  suggestCredentialSkipAfterRestoreFailure,
} from './restore-wizard-flow.js';

function inspectFixture(overrides: Partial<PfbackupInspectResult> = {}): PfbackupInspectResult {
  return {
    ok: true,
    backup: {
      createdAt: '2026-07-12T12:00:00.000Z',
      settingsFormatVersion: 1,
      releaseVersion: '1.2.3',
      routingMode: 'simple',
      portalEnabled: true,
      providerCredentialsIncluded: false,
    },
    compatibility: {
      archiveValid: true,
      settingsValid: true,
      targetAppReachable: true,
      restoreSupported: true,
      warnings: [],
    },
    ...overrides,
  };
}

test('restoreWizardChooseLead differs for pre-update vs standalone', () => {
  assert.match(restoreWizardChooseLead('pre-update'), /vor dem Update/i);
  assert.match(restoreWizardChooseLead('standalone'), /frische Datenbank/);
});

test('restoreInspectSummaryLines includes backup metadata', () => {
  const lines = restoreInspectSummaryLines(inspectFixture());
  assert.match(lines.join(' '), /2026-07-12/);
  assert.match(lines.join(' '), /simple/);
  assert.match(lines.join(' '), /1\.2\.3/);
});

test('restoreInspectSummaryLines keeps TLS detail when restore is blocked', () => {
  const lines = restoreInspectSummaryLines(
    inspectFixture({
      ok: false,
      backup: {
        ...inspectFixture().backup!,
        tls: {
          state: 'active',
          inBackup: true,
          preparedInBackup: false,
          sidecarPresent: false,
          sidecarMatches: false,
          metadataConsistent: true,
        },
      },
      compatibility: {
        archiveValid: true,
        settingsValid: true,
        targetAppReachable: true,
        restoreSupported: false,
        warnings: [],
      },
    }),
  );
  assert.match(lines.join(' '), /HTTPS: Sidecar fehlt/);
});

test('restoreTlsInspectSummaryLine rejects contradictory TLS metadata', () => {
  assert.equal(
    restoreTlsInspectSummaryLine({
      state: 'active',
      inBackup: false,
      preparedInBackup: false,
      sidecarPresent: false,
      sidecarMatches: false,
      metadataConsistent: false,
    }),
    'HTTPS: Angaben in der Sicherung widersprechen sich',
  );
});

test('restoreInspectBlockedMessage explains missing active TLS sidecar', () => {
  const fixture = inspectFixture();
  const message = restoreInspectBlockedMessage({
    ...fixture,
    ok: false,
    backup: {
      ...fixture.backup!,
      tls: {
        state: 'active',
        inBackup: true,
        preparedInBackup: false,
        sidecarPresent: false,
        sidecarMatches: false,
        metadataConsistent: true,
      },
    },
    compatibility: { ...fixture.compatibility, restoreSupported: false },
  });
  assert.match(message ?? '', /Sidecar.*fehlt/);
});

test('restoreInspectBlockedMessage explains unreachable maintenance API', () => {
  const message = restoreInspectBlockedMessage(
    inspectFixture({
      ok: false,
      compatibility: {
        archiveValid: true,
        settingsValid: true,
        targetAppReachable: false,
        restoreSupported: false,
        warnings: [],
      },
    }),
  );
  assert.match(message ?? '', /8082/);
});

test('restoreSuccessSummary mentions skipped provider credentials', () => {
  const summary = restoreSuccessSummary({
    ok: true,
    restoreId: 'r1',
    report: {
      restoreId: 'r1',
      routingMode: 'simple',
      portalEnabled: false,
      providerCredentialsSkipped: true,
      disabledProviderIds: ['sms'],
      compose: { running: true, services: [] },
    },
  });
  assert.match(summary, /Provider-Credentials/);
});

test('rollback failure blocks retry and pre-update skip', () => {
  const failed = {
    ok: false as const,
    restoreId: 'r1',
    failedPhase: 'import',
    rollbackAttempted: true,
    rollbackSucceeded: false,
    errors: ['Import fehlgeschlagen'],
  };
  assert.equal(isRestoreRollbackFailed(failed), true);
  assert.equal(canRetryRestoreAfterFailure(failed), false);
  assert.equal(canSkipRestoreAfterFailure(failed), false);
});

test('failed restore before mutation still allows skip', () => {
  const failed = {
    ok: false as const,
    restoreId: 'r1',
    failedPhase: 'validate_settings',
    rollbackAttempted: false,
    rollbackSucceeded: false,
    errors: ['Settings ungültig'],
  };
  assert.equal(canSkipRestoreAfterFailure(failed), true);
  assert.equal(canRetryRestoreAfterFailure(failed), true);
});

test('successful rollback allows retry and skip', () => {
  const failed = {
    ok: false as const,
    restoreId: 'r1',
    failedPhase: 'import',
    rollbackAttempted: true,
    rollbackSucceeded: true,
    errors: ['Import fehlgeschlagen'],
  };
  assert.equal(canSkipRestoreAfterFailure(failed), true);
  assert.equal(canRetryRestoreAfterFailure(failed), true);
});

test('shouldOfferCredentialSkip when backup includes provider credentials', () => {
  assert.equal(
    shouldOfferCredentialSkip({
      inspect: inspectFixture({
        backup: {
          createdAt: '2026-07-12T12:00:00.000Z',
          settingsFormatVersion: 1,
          releaseVersion: null,
          routingMode: 'simple',
          portalEnabled: false,
          providerCredentialsIncluded: true,
        },
      }),
    }),
    true,
  );
});

test('shouldOfferCredentialSkip after import failure with credential errors', () => {
  assert.equal(
    shouldOfferCredentialSkip({
      inspect: inspectFixture({
        backup: {
          createdAt: '2026-07-12T12:00:00.000Z',
          settingsFormatVersion: 1,
          releaseVersion: null,
          routingMode: 'simple',
          portalEnabled: false,
          providerCredentialsIncluded: true,
        },
      }),
      restoreResult: {
        ok: false,
        restoreId: 'r1',
        failedPhase: 'import_snapshot',
        rollbackAttempted: true,
        rollbackSucceeded: true,
        errors: ['Provider-Credentials konnten nicht entschlüsselt werden.'],
      },
    }),
    true,
  );
});

test('suggestCredentialSkipAfterRestoreFailure preselects skip on credential import failure', () => {
  const inspect = inspectFixture({
    backup: {
      createdAt: '2026-07-12T12:00:00.000Z',
      settingsFormatVersion: 1,
      releaseVersion: null,
      routingMode: 'simple',
      portalEnabled: false,
      providerCredentialsIncluded: true,
    },
  });
  const failed = {
    ok: false as const,
    restoreId: 'r1',
    failedPhase: 'import_snapshot',
    rollbackAttempted: true,
    rollbackSucceeded: true,
    errors: ['MFA-PIN passt nicht zu den Provider-Credentials im Backup.'],
  };
  assert.equal(
    suggestCredentialSkipAfterRestoreFailure({
      inspect,
      restoreResult: failed,
      skipProviderCredentials: false,
    }),
    true,
  );
  assert.equal(
    suggestCredentialSkipAfterRestoreFailure({
      inspect,
      restoreResult: failed,
      skipProviderCredentials: true,
    }),
    false,
  );
});

test('suggestCredentialSkipAfterRestoreFailure does not preselect on unrelated import errors', () => {
  const inspect = inspectFixture({
    backup: {
      createdAt: '2026-07-12T12:00:00.000Z',
      settingsFormatVersion: 1,
      releaseVersion: null,
      routingMode: 'simple',
      portalEnabled: false,
      providerCredentialsIncluded: true,
    },
  });
  const failed = {
    ok: false as const,
    restoreId: 'r1',
    failedPhase: 'import_snapshot',
    rollbackAttempted: true,
    rollbackSucceeded: true,
    errors: ['Catalog integrity check failed after import.'],
  };
  assert.equal(shouldOfferCredentialSkip({ inspect, restoreResult: failed }), true);
  assert.equal(
    suggestCredentialSkipAfterRestoreFailure({
      inspect,
      restoreResult: failed,
      skipProviderCredentials: false,
    }),
    false,
  );
});
