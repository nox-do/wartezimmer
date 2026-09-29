import type { PfupdateApplyResult } from '../shared/host-status.js';

export function formatPfupdateFailure(result: Extract<PfupdateApplyResult, { ok: false }>): string {
  const parts: string[] = [];
  if (result.rollbackAttempted && result.rollbackSucceeded) {
    parts.push('Update fehlgeschlagen. Die vorherige Version wurde wiederhergestellt.');
  } else if (result.rollbackAttempted && !result.rollbackSucceeded) {
    parts.push(
      'Update und automatische Wiederherstellung sind fehlgeschlagen. Bitte keine weiteren Wartungsaktionen ausführen.',
    );
    parts.push(`Vorgangsnummer: ${result.updateId}`);
  } else {
    parts.push('Update fehlgeschlagen.');
  }
  if (result.errors.length > 0) {
    parts.push(result.errors.join(' '));
  }
  return parts.join(' ');
}

export function formatPfupdateSuccess(result: Extract<PfupdateApplyResult, { ok: true }>): string {
  const parts = [`Update abgeschlossen — Version ${result.report.targetVersion}.`];
  if (result.report.previousVersion) {
    parts.push(`Vorher: ${result.report.previousVersion}.`);
  }
  return parts.join(' ');
}
