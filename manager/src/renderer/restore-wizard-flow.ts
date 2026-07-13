import type { PfbackupInspectResult, PfbackupRestoreResult } from '../shared/host-status.js';

export type RestoreWizardMode = 'standalone' | 'pre-update';

export type RestoreWizardPhase =
  | 'closed'
  | 'choose'
  | 'inspect'
  | 'preview'
  | 'restoring'
  | 'success'
  | 'failed';

export type RestoreWizardState = {
  phase: RestoreWizardPhase;
  mode: RestoreWizardMode;
  busy: boolean;
  content: string | null;
  filePath: string | null;
  inspect: PfbackupInspectResult | null;
  restoreResult: PfbackupRestoreResult | null;
  skipProviderCredentials: boolean;
  statusText: string;
  error: string | null;
};

export function createInitialRestoreWizardState(): RestoreWizardState {
  return {
    phase: 'closed',
    mode: 'standalone',
    busy: false,
    content: null,
    filePath: null,
    inspect: null,
    restoreResult: null,
    skipProviderCredentials: false,
    statusText: '',
    error: null,
  };
}

export function restoreWizardChooseTitle(mode: RestoreWizardMode): string {
  return mode === 'pre-update' ? 'Vor dem Software-Update' : 'Settings wiederherstellen';
}

export function restoreWizardChooseLead(mode: RestoreWizardMode): string {
  if (mode === 'pre-update') {
    return 'Soll vor dem Update ein Praxis-Backup (.pfbackup) wiederhergestellt werden? Der Stack wird dabei kurz gestoppt; Patientendaten in der laufenden DB werden verworfen und Settings aus dem Backup importiert.';
  }
  return 'Praxis-Backup (.pfbackup) auswählen und Settings in eine frische Datenbank importieren. Der Stack wird kurz offline sein.';
}

export function restoreInspectSummaryLines(inspect: PfbackupInspectResult): string[] {
  if (!inspect.ok || !inspect.backup) {
    return [];
  }
  const lines = [
    `Backup vom ${inspect.backup.createdAt}`,
    `Routing: ${inspect.backup.routingMode ?? '—'}`,
    `Portal: ${inspect.backup.portalEnabled ? 'an' : 'aus'}`,
  ];
  if (inspect.backup.releaseVersion) {
    lines.push(`Release im Backup: ${inspect.backup.releaseVersion}`);
  }
  if (inspect.backup.providerCredentialsIncluded) {
    lines.push('SMS-Provider-Credentials im Backup enthalten.');
  }
  return lines;
}

export function restoreInspectBlockedMessage(inspect: PfbackupInspectResult): string | null {
  if (inspect.ok && inspect.compatibility.restoreSupported) {
    return null;
  }
  const errors = inspect.errors ?? [];
  if (errors.length > 0) {
    return errors.join(' ');
  }
  if (!inspect.compatibility.archiveValid) {
    return 'Backup-Archiv ist ungültig.';
  }
  if (!inspect.compatibility.settingsValid) {
    return 'Settings sind für Restore nicht importierbar.';
  }
  if (!inspect.compatibility.targetAppReachable) {
    return 'Maintenance-API (Port 8082) ist nicht erreichbar.';
  }
  return 'Restore wird nicht unterstützt.';
}

export function restoreFailureSummary(
  result: Extract<PfbackupRestoreResult, { ok: false }>,
): string {
  const parts = [`Fehler in Phase „${result.failedPhase}“.`, ...result.errors];
  if (result.rollbackAttempted) {
    parts.push(
      result.rollbackSucceeded
        ? 'Automatischer Rollback wurde ausgeführt.'
        : 'Automatischer Rollback ist fehlgeschlagen — manuelle Recovery nötig.',
    );
  }
  return parts.join(' ');
}

export const RESTORE_ROLLBACK_FAILED_RECOVERY_MESSAGE =
  'Automatische Wiederherstellung des vorherigen Zustands ist fehlgeschlagen. Software-Update nicht fortsetzen. Bitte Recovery-Details prüfen.';

export function isRestoreRollbackFailed(result: PfbackupRestoreResult | null): boolean {
  return (
    result !== null &&
    !result.ok &&
    result.rollbackAttempted === true &&
    result.rollbackSucceeded === false
  );
}

/** Pre-Update-Fortsetzung nur, wenn kein Restore-Schreiben offen blieb oder Rollback erfolgreich war. */
export function canSkipRestoreAfterFailure(result: PfbackupRestoreResult | null): boolean {
  if (result === null || result.ok) {
    return true;
  }
  if (!result.rollbackAttempted) {
    return true;
  }
  return result.rollbackSucceeded;
}

export function canRetryRestoreAfterFailure(result: PfbackupRestoreResult | null): boolean {
  return !isRestoreRollbackFailed(result);
}

export function restoreSuccessSummary(
  result: Extract<PfbackupRestoreResult, { ok: true }>,
): string {
  const parts = ['Settings wurden wiederhergestellt.'];
  if (result.report.routingMode) {
    parts.push(`Routing: ${result.report.routingMode}.`);
  }
  if (result.report.providerCredentialsSkipped) {
    parts.push('Provider-Credentials wurden übersprungen.');
  }
  return parts.join(' ');
}

const CREDENTIAL_ISSUE_IMPORT_PHASES = new Set([
  'import_snapshot',
  'import_settings',
  'import',
  'verify_export',
  'verify_settings',
]);

function textSuggestsCredentialIssue(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('provider') ||
    lower.includes('credential') ||
    lower.includes('pin') ||
    lower.includes('entschlüss') ||
    lower.includes('decrypt') ||
    lower.includes('messaging')
  );
}

export function shouldOfferCredentialSkip(input: {
  inspect: PfbackupInspectResult | null;
  restoreResult?: PfbackupRestoreResult | null;
}): boolean {
  const inspect = input.inspect;
  if (!inspect?.backup) {
    return false;
  }
  if (inspect.backup.providerCredentialsIncluded) {
    return true;
  }
  const warnings = inspect.compatibility.warnings ?? [];
  if (warnings.some((warning) => textSuggestsCredentialIssue(warning))) {
    return true;
  }
  const restoreResult = input.restoreResult;
  if (restoreResult && !restoreResult.ok) {
    const combined = [restoreResult.failedPhase, ...restoreResult.errors].join(' ');
    if (textSuggestsCredentialIssue(combined)) {
      return true;
    }
    if (
      inspect.backup.providerCredentialsIncluded &&
      CREDENTIAL_ISSUE_IMPORT_PHASES.has(restoreResult.failedPhase)
    ) {
      return true;
    }
  }
  return false;
}

export function suggestCredentialSkipAfterRestoreFailure(input: {
  inspect: PfbackupInspectResult | null;
  restoreResult: Extract<PfbackupRestoreResult, { ok: false }>;
  skipProviderCredentials: boolean;
}): boolean {
  if (input.skipProviderCredentials) {
    return false;
  }
  if (!shouldOfferCredentialSkip({ inspect: input.inspect, restoreResult: input.restoreResult })) {
    return false;
  }
  const combined = [input.restoreResult.failedPhase, ...input.restoreResult.errors].join(' ');
  return textSuggestsCredentialIssue(combined);
}
