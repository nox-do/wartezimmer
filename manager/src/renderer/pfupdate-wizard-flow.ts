import type { PfupdateApplyResult, PfupdateInspectResult } from '../shared/host-status.js';

export type PfupdateWizardState =
  | { phase: 'closed' | 'select' }
  | { phase: 'inspect'; filePath: string }
  | { phase: 'preview' | 'applying'; filePath: string; inspect: PfupdateInspectResult }
  | { phase: 'success'; applyResult: Extract<PfupdateApplyResult, { ok: true }> }
  | { phase: 'failed'; error: string; applyResult?: Extract<PfupdateApplyResult, { ok: false }> };

export function createInitialPfupdateWizardState(): PfupdateWizardState {
  return { phase: 'closed' };
}

export function pfupdateWizardIsBusy(state: PfupdateWizardState): boolean {
  return ['select', 'inspect', 'applying'].includes(state.phase);
}

export function pfupdateWizardProgress(state: PfupdateWizardState): string {
  switch (state.phase) {
    case 'select':
      return 'Update-Paket wählen …';
    case 'inspect':
      return 'Update-Paket wird geprüft …';
    case 'applying':
      return PFUPDATE_APPLY_LOADING_MESSAGE;
    default:
      return '';
  }
}

export function formatPfupdateVersionLabel(version: string | null | undefined): string {
  if (!version) {
    return 'Unbekannt';
  }
  const value = version.trim();
  if (!value) {
    return 'Unbekannt';
  }
  if (value.toLowerCase() === 'local') {
    return 'Lokale Version';
  }
  return value;
}

export function pfupdateInspectSummaryLines(inspect: PfupdateInspectResult): string[] {
  if (!inspect.package) {
    return [];
  }
  const lines = [`Neue Version: ${formatPfupdateVersionLabel(inspect.package.releaseVersion)}`];
  lines.push(`Installierte Version: ${formatPfupdateVersionLabel(inspect.currentReleaseVersion)}`);
  lines.push(
    `Benötigte Manager-Version: ${formatPfupdateVersionLabel(inspect.package.minimumManagerVersion)}`,
  );
  return lines;
}

export function pfupdateInspectBlockedMessage(inspect: PfupdateInspectResult): string | null {
  if (inspect.ok && inspect.compatibility.updateSupported) {
    return null;
  }
  const errors = inspect.errors ?? [];
  if (errors.length > 0) {
    return errors.join(' ');
  }
  const warnings = inspect.compatibility.warnings;
  if (warnings.length > 0) {
    return warnings.join(' ');
  }
  return 'Update-Paket kann nicht eingespielt werden.';
}

export function pfupdateApplyConfirmHint(): string {
  return 'Vor dem Update wird automatisch ein Praxis-Backup erstellt. Praxis Flow ist während des Updates vorübergehend nicht verfügbar; die laufende Warteschlange geht verloren.';
}

export const PFUPDATE_APPLY_LOADING_MESSAGE =
  'Update läuft — Praxis ist kurz offline. Das kann auf langsameren Rechnern einige Minuten dauern.';
