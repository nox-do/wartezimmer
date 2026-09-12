import type { PfupdateApplyResult, PfupdateInspectResult } from '../shared/host-status.js';

export type PfupdateWizardPhase =
  | 'closed'
  | 'inspect'
  | 'preview'
  | 'applying'
  | 'success'
  | 'failed';

export type PfupdateWizardState = {
  phase: PfupdateWizardPhase;
  busy: boolean;
  filePath: string | null;
  inspect: PfupdateInspectResult | null;
  applyResult: PfupdateApplyResult | null;
  statusText: string;
  error: string | null;
};

export function createInitialPfupdateWizardState(): PfupdateWizardState {
  return {
    phase: 'closed',
    busy: false,
    filePath: null,
    inspect: null,
    applyResult: null,
    statusText: '',
    error: null,
  };
}

export function formatPfupdateVersionLabel(version: string | null | undefined): string {
  if (!version) {
    return 'unknown';
  }
  const value = version.trim();
  if (!value) {
    return 'unknown';
  }
  if (value.toLowerCase() === 'local') {
    return 'local build';
  }
  return value;
}

export function pfupdateInspectSummaryLines(inspect: PfupdateInspectResult): string[] {
  if (!inspect.package) {
    return [];
  }
  const lines = [`Target release: ${formatPfupdateVersionLabel(inspect.package.releaseVersion)}`];
  lines.push(`Current: ${formatPfupdateVersionLabel(inspect.currentReleaseVersion)}`);
  lines.push(
    `Minimum manager: ${formatPfupdateVersionLabel(inspect.package.minimumManagerVersion)}`,
  );
  lines.push(`Settings formats: ${inspect.package.supportedSettingsFormatVersions.join(', ')}`);
  lines.push(`DB schema after update: ${inspect.package.targetSchemaVersion}`);
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
  return 'Vor dem Cutover wird automatisch ein Praxis-Backup erstellt. Praxis ist während des Updates kurz offline; die laufende Warteschlange geht verloren.';
}

export const PFUPDATE_APPLY_LOADING_MESSAGE =
  'Update läuft — Praxis ist kurz offline. Das kann auf langsameren Rechnern einige Minuten dauern.';
