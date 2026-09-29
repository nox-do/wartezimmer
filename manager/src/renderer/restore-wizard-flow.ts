import type {
  PfbackupInspectResult,
  PfbackupRestoreResult,
  PfbackupTlsInspectSummary,
} from '../shared/host-status.js';

export type RestoreWizardMode = 'standalone' | 'pre-update';

export type RestoreBackup = {
  content: string;
  filePath: string;
  inspect: PfbackupInspectResult;
  draft: { skipProviderCredentials: boolean };
};

export type RestoreWizardState =
  | { phase: 'closed' }
  | { phase: 'choose'; mode: 'pre-update' }
  | { phase: 'select'; mode: RestoreWizardMode }
  | { phase: 'inspect'; mode: RestoreWizardMode; filePath: string }
  | {
      phase: 'preview' | 'confirm-https' | 'restoring';
      mode: RestoreWizardMode;
      backup: RestoreBackup;
    }
  | {
      phase: 'success';
      mode: RestoreWizardMode;
      restoreResult: Extract<PfbackupRestoreResult, { ok: true }>;
    }
  | {
      phase: 'failed';
      mode: RestoreWizardMode;
      error: string;
      backup?: RestoreBackup;
      restoreResult?: Extract<PfbackupRestoreResult, { ok: false }>;
    };

export function createInitialRestoreWizardState(): RestoreWizardState {
  return { phase: 'closed' };
}

export function restoreWizardIsBusy(state: RestoreWizardState): boolean {
  return ['select', 'inspect', 'restoring'].includes(state.phase);
}

export function restoreWizardProgress(state: RestoreWizardState): string {
  switch (state.phase) {
    case 'select':
      return 'Backup-Datei wählen …';
    case 'inspect':
      return 'Backup wird geprüft …';
    case 'restoring':
      return 'Wiederherstellung läuft — Stack wird gestoppt und neu gestartet …';
    default:
      return '';
  }
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

/** Pure renderer copy for the optional Setup-owned TLS inspect result. */
export function restoreTlsInspectSummaryLine(
  tls: PfbackupTlsInspectSummary | undefined,
): string | null {
  if (!tls) {
    return null;
  }
  if (!tls.metadataConsistent) {
    return 'HTTPS: Angaben in der Sicherung passen nicht zusammen';
  }
  if (tls.preparedInBackup) {
    if (!tls.payloadPresent) {
      return 'HTTPS war vorbereitet, HTTPS-Daten fehlen — Vorbereitung wird verworfen';
    }
    if (!tls.payloadMatches) {
      return 'HTTPS-Daten passen nicht zu diesem Backup — Vorbereitung wird verworfen';
    }
    return 'HTTPS ist vorbereitet; HTTPS-Daten sind enthalten';
  }
  if (!tls.inBackup) {
    return null;
  }
  if (!tls.payloadPresent) {
    return 'HTTPS ist vorgesehen, aber die HTTPS-Daten fehlen';
  }
  if (!tls.payloadMatches) {
    return 'HTTPS-Daten gehören nicht zu diesem Computer oder Hostnamen';
  }
  return 'Zertifikat und HTTPS-Daten sind in der Sicherung enthalten';
}

export function restoreInspectSummaryLines(inspect: PfbackupInspectResult): string[] {
  if (!inspect.backup) {
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
  const tlsLine = restoreTlsInspectSummaryLine(inspect.backup.tls);
  if (tlsLine) {
    lines.push(tlsLine);
  }
  return lines;
}

/** TLS-blocked inspect uses tlsRestoreBlockedCopy via the Setup inspect result. */
export function restoreInspectBlockedMessage(inspect: PfbackupInspectResult): string | null {
  if (inspect.ok && inspect.compatibility.restoreSupported) {
    return null;
  }
  const tls = inspect.backup?.tls;
  if (tls && !tls.metadataConsistent) {
    return 'Die HTTPS-Angaben in dieser Sicherung passen nicht zusammen. Wiederherstellen wird abgelehnt.';
  }
  if (tls?.inBackup && !tls.payloadPresent) {
    return 'Diese Sicherung erwartet HTTPS, aber die HTTPS-Daten fehlen. Wiederherstellen würde Geräte auf https:// stellen ohne Zertifikat — deshalb abgelehnt.';
  }
  if (tls?.inBackup && !tls.payloadMatches) {
    return 'Die HTTPS-Daten gehören zu einer anderen Installation oder einem anderen Hostnamen.';
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
  return result !== null && !result.ok && result.rollbackAttempted && result.rollbackSucceeded;
}

export function restoreSuccessSummary(
  result: Extract<PfbackupRestoreResult, { ok: true }>,
): string {
  const parts = ['Settings wurden wiederhergestellt.'];
  if (result.report.providerCredentialsSkipped) {
    parts.push('Provider-Credentials wurden übersprungen.');
  }
  return parts.join(' ');
}

export function shouldOfferCredentialSkip(inspect: PfbackupInspectResult | undefined): boolean {
  return inspect?.backup?.providerCredentialsIncluded === true;
}
