import {
  DOCKER_FILE_SHARING_HINT,
  needsDockerFileSharingHint,
} from '../shared/docker-file-sharing-hint.js';
import type {
  HostStatus,
  LoadDeliveryImagesResult,
  RoutingMode,
  StorageFoldersResult,
} from '../shared/host-status.js';
import { formatEnvBackupLabel } from '@praxis-flow/server-shared';
import { deliveryImagesSummary } from './delivery-images-flow.js';

export const MAINTENANCE_LOG_SERVICES = [
  { value: 'app', label: 'app' },
  { value: 'sandbox', label: 'sandbox' },
  { value: 'gateway', label: 'gateway' },
] as const;

export type MaintenanceInfoRow = { label: string; value: string };

export const STACK_OFFLINE_CONFIRM_MESSAGE =
  'Praxis offline — Terminal und MFA sind während Stop/Neustart nicht erreichbar. Fortfahren?';

export const SOFTWARE_UPDATE_CONFIRM_MESSAGE =
  'Praxis offline — während des Updates sind Terminal und MFA kurz nicht erreichbar. Fortfahren?';

export const STORAGE_PATHS_RESTART_CONFIRM_MESSAGE =
  'Die neuen Import-/Export-Ordner werden erst nach einem Stack-Neustart aktiv. Pfade speichern und Stack jetzt neu starten?';

export const STORAGE_PATHS_VALIDATION_ERROR = 'Bitte Import- und Exportordner angeben.';

export const STORAGE_SAVE_PROGRESS_TEXT = 'Speichern …';
export const ROUTING_MODE_SAVE_PROGRESS_TEXT = 'Speichern …';
export const SOFTWARE_UPDATE_LOADING_TEXT = 'Prüfsumme und Import …';
export const PIN_RESET_PROGRESS_TEXT = 'PIN-Reset läuft …';

export function backupInfoText(
  latestBackupPath: string | null,
  envExists: boolean | undefined,
): string {
  if (latestBackupPath) {
    return `Letztes Backup: ${formatEnvBackupLabel(latestBackupPath)}`;
  }
  if (envExists) {
    return 'Noch kein Backup vorhanden.';
  }
  return 'Keine .env vorhanden.';
}

export function stackStatusLabel(running: boolean): string {
  return running ? 'Läuft' : 'Gestoppt';
}

export function showRestartBuildButton(mode: HostStatus['mode'] | undefined): boolean {
  return mode === 'repo';
}

export function logsDisplayText(logsText: string): string {
  return logsText || '(keine Logs)';
}

export function storagePathsChanged(
  draftImports: string,
  draftExports: string,
  current: { imports: string; exports: string } | undefined,
): boolean {
  if (!current) {
    return false;
  }
  return (
    draftImports.trim() !== current.imports || draftExports.trim() !== current.exports
  );
}

export function storageWarningText(running: boolean, pathsChanged: boolean): string | null {
  if (running && pathsChanged) {
    return 'Neue Mounts werden erst nach einem Stack-Neustart aktiv. Beim Übernehmen wird danach gefragt.';
  }
  return null;
}

export function softwareUpdateSectionVisible(status: HostStatus | null): boolean {
  return status?.deliveryImages.required ?? false;
}

export function softwareUpdateInfoRows(status: HostStatus): MaintenanceInfoRow[] {
  const rows: MaintenanceInfoRow[] = [{ label: 'Aktuell', value: deliveryImagesSummary(status) }];
  if (status.deliveryImages.appImage) {
    rows.push({ label: 'app', value: status.deliveryImages.appImage });
  }
  if (status.deliveryImages.sandboxImage) {
    rows.push({ label: 'sandbox', value: status.deliveryImages.sandboxImage });
  }
  return rows;
}

export function routingModeSaveDisabled(
  busy: boolean,
  draft: RoutingMode | null,
  saved: RoutingMode | null,
): boolean {
  return busy || draft === null || saved === null || draft === saved;
}

export function routingModeSuccessText(routingMode: RoutingMode): string {
  return routingMode === 'complex'
    ? 'Complex Routing aktiv — Journey-UI in MFA nach Reload sichtbar.'
    : 'Simple Routing aktiv.';
}

export function fileSharingHintText(hostPlatform: string): string | null {
  return needsDockerFileSharingHint(hostPlatform) ? DOCKER_FILE_SHARING_HINT : null;
}

export function composeActionErrorMessage(
  action: 'start' | 'stop' | 'restart',
  log: string | null | undefined,
): string {
  return log || `Aktion „${action}“ fehlgeschlagen.`;
}

export function storageSaveStatusText(
  result: StorageFoldersResult,
  restartCompose: boolean,
): string {
  const parts = ['Pfade gespeichert.'];
  if (result.created.length > 0) {
    parts.push(`Ordner angelegt: ${result.created.join(', ')}`);
  }
  if (result.backupPath) {
    parts.push(`Backup: ${formatEnvBackupLabel(result.backupPath)}`);
  }
  if (result.composeRestarted) {
    parts.push('Stack neu gestartet.');
  } else if (result.stackWasRunning && restartCompose) {
    parts.push('Stack-Neustart fehlgeschlagen — bitte manuell neu starten.');
  } else if (result.stackWasRunning) {
    parts.push('Stack läuft noch mit alten Mounts — Neustart empfohlen.');
  }
  return parts.join(' ');
}

export function storageSaveErrorText(
  result: StorageFoldersResult,
  restartCompose: boolean,
): string | null {
  if (result.stackWasRunning && restartCompose && !result.composeRestarted) {
    return result.restartLog || 'Stack-Neustart fehlgeschlagen.';
  }
  return null;
}

export function softwareUpdateStatusText(
  result: LoadDeliveryImagesResult,
  restartCompose: boolean,
): string {
  const parts = [
    `Import OK — SHA256 (${result.sha256Source}) verifiziert.`,
    `app: ${result.appImage}`,
    `sandbox: ${result.sandboxImage}`,
  ];
  if (result.releaseVersion) {
    parts.push(`Version: ${result.releaseVersion}`);
  }
  if (result.backupPath) {
    parts.push(`Backup: ${formatEnvBackupLabel(result.backupPath)}`);
  }
  if (restartCompose) {
    parts.push(
      result.composeRestarted
        ? 'Stack mit neuen Images neu gestartet.'
        : 'Stack-Neustart fehlgeschlagen — bitte manuell neu starten.',
    );
  } else {
    parts.push('Stack unverändert — bei laufendem Betrieb Neustart ausführen.');
  }
  return parts.join(' ');
}

export function softwareUpdateErrorText(
  result: LoadDeliveryImagesResult,
  restartCompose: boolean,
): string | null {
  if (restartCompose && !result.composeRestarted && result.restartLog) {
    return result.restartLog;
  }
  return null;
}

export function pinResetSuccessText(defaultPin: string): string {
  return `Erfolgreich — MFA- und Ops-PIN ist jetzt ${defaultPin}. MFA-PIN in MFA → Betrieb, Ops-PIN in System → PIN & Sicherheit ändern.`;
}
