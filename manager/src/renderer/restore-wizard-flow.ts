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
      return 'Einstellungen werden wiederhergestellt — Wartezimmer wird neu gestartet …';
    default:
      return '';
  }
}

export function restoreWizardChooseTitle(mode: RestoreWizardMode): string {
  return mode === 'pre-update' ? 'Vor dem Software-Update' : 'Einstellungen wiederherstellen';
}

export function restoreWizardChooseLead(mode: RestoreWizardMode): string {
  if (mode === 'pre-update') {
    return 'Soll vor dem Update ein Wartezimmer-Backup (.pfbackup) wiederhergestellt werden? Wartezimmer wird dabei angehalten. Die aktuelle Warteschlange und die darin gespeicherten Patientendaten werden gelöscht; die gesicherten Einstellungen werden übernommen.';
  }
  return 'Wählen Sie ein Wartezimmer-Backup (.pfbackup), um die gesicherten Einstellungen wiederherzustellen. Wartezimmer ist währenddessen nicht verfügbar.';
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
    lines.push(`Software-Version im Backup: ${inspect.backup.releaseVersion}`);
  }
  if (inspect.backup.providerCredentialsIncluded) {
    lines.push('SMS-Zugangsdaten sind im Backup enthalten.');
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
    return 'Die Einstellungen aus diesem Backup können nicht übernommen werden.';
  }
  if (!inspect.compatibility.targetAppReachable) {
    return 'Der Manager kann die App zurzeit nicht erreichen.';
  }
  return 'Dieses Backup kann nicht wiederhergestellt werden.';
}

function restoreStepFailure(phase: string): string {
  const steps: Record<string, string> = {
    validate_archive: 'Das Backup konnte nicht geprüft werden.',
    validate_settings: 'Die gesicherten Einstellungen konnten nicht geprüft werden.',
    backup_rollback_state: 'Der bisherige Zustand konnte nicht gesichert werden.',
    stop_stack: 'Wartezimmer konnte nicht angehalten werden.',
    write_env: 'Die Konfiguration konnte nicht gespeichert werden.',
    write_manager_state: 'Die Installationseinstellungen konnten nicht gespeichert werden.',
    move_database: 'Die bisherige Datenbank konnte nicht gesichert werden.',
    start_app: 'Die App konnte nicht gestartet werden.',
    wait_maintenance: 'Der Manager konnte keine Verbindung zur App herstellen.',
    import_snapshot: 'Die gesicherten Einstellungen konnten nicht übernommen werden.',
    verify_export: 'Die übernommenen Einstellungen konnten nicht bestätigt werden.',
    start_full_stack: 'Wartezimmer konnte nicht vollständig gestartet werden.',
    health_check: 'Die abschließende Funktionsprüfung ist fehlgeschlagen.',
  };
  return steps[phase] ?? 'Die Wiederherstellung ist fehlgeschlagen.';
}

export function restoreFailureSummary(
  result: Extract<PfbackupRestoreResult, { ok: false }>,
): string {
  const parts = [restoreStepFailure(result.failedPhase), ...result.errors];
  if (result.rollbackAttempted) {
    parts.push(
      result.rollbackSucceeded
        ? 'Der vorherige Zustand wurde automatisch wiederhergestellt.'
        : 'Der vorherige Zustand konnte nicht wiederhergestellt werden. Bitte wenden Sie sich an Ihre IT-Betreuung.',
    );
  }
  return parts.join(' ');
}

export const RESTORE_ROLLBACK_FAILED_RECOVERY_MESSAGE =
  'Automatische Wiederherstellung des vorherigen Zustands ist fehlgeschlagen. Software-Update nicht fortsetzen. Bitte öffnen Sie die Diagnose im Status-Tab und wenden Sie sich an Ihre IT-Betreuung.';

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
  const parts = ['Die Einstellungen wurden wiederhergestellt.'];
  if (result.report.providerCredentialsSkipped) {
    parts.push('Die SMS-Zugangsdaten wurden nicht übernommen.');
  }
  return parts.join(' ');
}

export function shouldOfferCredentialSkip(inspect: PfbackupInspectResult | undefined): boolean {
  return inspect?.backup?.providerCredentialsIncluded === true;
}
