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
} from './restore-wizard-flow.js';

function inspectFixture(overrides: Partial<PfbackupInspectResult> = {}): PfbackupInspectResult {
  return {
    ok: true,
    currentTlsClaimsHttps: false,
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
          payloadPresent: false,
          payloadMatches: false,
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
  assert.match(lines.join(' '), /HTTPS-Daten fehlen/);
});

test('restoreTlsInspectSummaryLine rejects contradictory TLS metadata', () => {
  assert.equal(
    restoreTlsInspectSummaryLine({
      state: 'active',
      inBackup: false,
      preparedInBackup: false,
      payloadPresent: false,
      payloadMatches: false,
      metadataConsistent: false,
    }),
    'HTTPS: Angaben in der Sicherung passen nicht zusammen',
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
        payloadPresent: false,
        payloadMatches: false,
        metadataConsistent: true,
      },
    },
    compatibility: { ...fixture.compatibility, restoreSupported: false },
  });
  assert.match(message ?? '', /HTTPS-Daten fehlen/);
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
  assert.equal(canRetryRestoreAfterFailure(failed), false);
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

for (const included of [false, true]) {
  test(`credential checkbox follows backup metadata: ${included}`, () => {
    assert.equal(
      shouldOfferCredentialSkip(
        inspectFixture({
          backup: {
            ...inspectFixture().backup!,
            providerCredentialsIncluded: included,
          },
        }),
      ),
      included,
    );
  });
}
