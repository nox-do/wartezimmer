import type { PfupdateApplyResult } from '../shared/host-status.js';
import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';

export const PFUPDATE_APPLY_LOADING_MESSAGE =
  'Update läuft — Praxis ist kurz offline. Das kann auf langsameren Rechnern einige Minuten dauern.';

export type PickAndApplyPfupdateResult = {
  ok: boolean;
  canceled: boolean;
  error?: string;
  result?: PfupdateApplyResult;
};

export async function pickAndApplyPfupdate(
  api: PraxisManagerApi,
  options?: {
    loadingMessage?: string;
    onProgress?: (statusText: string) => void;
  },
): Promise<PickAndApplyPfupdateResult> {
  const picked = await api.selectPfupdateArchive();
  if (picked.canceled || !picked.path) {
    return { ok: false, canceled: true };
  }

  const loadingMessage = options?.loadingMessage ?? PFUPDATE_APPLY_LOADING_MESSAGE;
  options?.onProgress?.(loadingMessage);

  try {
    const result = await api.applyPfupdate({ archivePath: picked.path });
    if (!result.ok) {
      return {
        ok: false,
        canceled: false,
        error: formatPfupdateFailure(result),
        result,
      };
    }
    return { ok: true, canceled: false, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, canceled: false, error: message };
  }
}

export function formatPfupdateFailure(result: Extract<PfupdateApplyResult, { ok: false }>): string {
  const parts: string[] = [];
  if (result.rollbackAttempted && result.rollbackSucceeded) {
    parts.push('Update fehlgeschlagen. Die vorherige Version wurde wiederhergestellt.');
  } else if (result.rollbackAttempted && !result.rollbackSucceeded) {
    parts.push(
      'Update und automatische Wiederherstellung sind fehlgeschlagen. Bitte keine weiteren Wartungsaktionen ausführen.',
    );
    parts.push(`Recovery-ID: ${result.updateId}`);
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
