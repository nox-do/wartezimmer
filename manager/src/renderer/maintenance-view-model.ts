import {
  DOCKER_FILE_SHARING_HINT,
  needsDockerFileSharingHint,
} from '../shared/docker-file-sharing-hint.js';
import type {
  HostStatus,
  LoadDeliveryImagesResult,
  StorageFoldersResult,
} from '../shared/host-status.js';
import { formatEnvBackupLabel } from '@praxis-flow/server-shared/env-backup';
import { formatPfbackupLabel } from '@praxis-flow/server-shared/backup-path-labels';
import { deliveryImagesSummary } from './delivery-images-flow.js';

export const MAINTENANCE_LOG_SERVICES = [
  { value: 'app', label: 'app' },
  { value: 'sandbox', label: 'sandbox' },
  { value: 'proxy', label: 'proxy' },
] as const;

export type MaintenanceOperation =
  | 'bootstrap'
  | 'stack'
  | 'logs'
  | 'storage'
  | 'backup'
  | 'tlsSidecar'
  | 'routing'
  | 'pin';

export type MaintenanceErrorSurface =
  | 'stack'
  | 'logs'
  | 'storage'
  | 'backup'
  | 'tlsSidecar'
  | 'routing'
  | 'pin';

export type MaintenanceErrors = Record<MaintenanceErrorSurface, string | null>;

export type MaintenanceExpanderId = 'operations' | 'practice' | 'security' | 'diagnostics';

export function emptyMaintenanceErrors(): MaintenanceErrors {
  return {
    stack: null,
    logs: null,
    storage: null,
    backup: null,
    tlsSidecar: null,
    routing: null,
    pin: null,
  };
}

const MAINTENANCE_ERROR_SECTION: Record<MaintenanceErrorSurface, MaintenanceExpanderId> = {
  stack: 'operations',
  logs: 'diagnostics',
  storage: 'practice',
  backup: 'security',
  tlsSidecar: 'security',
  routing: 'practice',
  pin: 'security',
};

const MAINTENANCE_ERROR_OPEN_ORDER: MaintenanceErrorSurface[] = [
  'stack',
  'routing',
  'storage',
  'backup',
  'tlsSidecar',
  'pin',
  'logs',
];

export function maintenanceErrorFocusKey(errors: MaintenanceErrors): string {
  return MAINTENANCE_ERROR_OPEN_ORDER.filter((surface) => errors[surface])
    .map((surface) => `${surface}:${errors[surface]}`)
    .join('|');
}

export function maintenanceSectionToOpenForErrors(
  errors: MaintenanceErrors,
): MaintenanceExpanderId | null {
  for (const surface of MAINTENANCE_ERROR_OPEN_ORDER) {
    if (errors[surface]) {
      return MAINTENANCE_ERROR_SECTION[surface];
    }
  }
  return null;
}

export function maintenanceSectionToOpenForErrorChange(
  previous: MaintenanceErrors | null,
  current: MaintenanceErrors,
): MaintenanceExpanderId | null {
  for (const surface of MAINTENANCE_ERROR_OPEN_ORDER) {
    if (current[surface] && !previous?.[surface]) {
      return MAINTENANCE_ERROR_SECTION[surface];
    }
  }
  for (const surface of MAINTENANCE_ERROR_OPEN_ORDER) {
    if (current[surface] && current[surface] !== previous?.[surface]) {
      return MAINTENANCE_ERROR_SECTION[surface];
    }
  }
  return null;
}

export type MaintenanceInfoRow = { label: string; value: string };

export const STACK_OFFLINE_CONFIRM_MESSAGE =
  'Praxis offline — Terminal und MFA sind während Stop/Neustart nicht erreichbar. Fortfahren?';

export const STORAGE_PATHS_RESTART_CONFIRM_MESSAGE =
  'Die neuen Import-/Export-Ordner werden erst nach einem Stack-Neustart aktiv. Pfade speichern und Stack jetzt neu starten?';

export const STORAGE_PATHS_VALIDATION_ERROR = 'Bitte Import- und Exportordner angeben.';

export const STORAGE_SAVE_PROGRESS_TEXT = 'Speichern …';
export const ROUTING_MODE_SAVE_PROGRESS_TEXT = 'Speichern …';
export const SOFTWARE_UPDATE_LOADING_TEXT = 'Update läuft …';
export const PIN_RESET_PROGRESS_TEXT = 'PIN-Reset läuft …';
export const MAINTENANCE_OTHER_ACTION_RUNNING = 'Es läuft bereits eine andere Aktion.';

export function backupInfoText(
  latestBackupPath: string | null,
  envExists: boolean | undefined,
): string {
  if (latestBackupPath) {
    return `Letztes Backup: ${formatPfbackupLabel(latestBackupPath)}`;
  }
  if (envExists) {
    return 'Noch kein Backup vorhanden.';
  }
  return 'Keine .env vorhanden.';
}

export function pfbackupValidateSuccessText(summary: {
  routingMode: string | null;
  releaseVersion: string | null;
}): string {
  const parts = ['Backup ist wiederherstellbar.'];
  if (summary.routingMode) {
    parts.push(`Routing: ${summary.routingMode}.`);
  }
  if (summary.releaseVersion) {
    parts.push(`Release: ${summary.releaseVersion}.`);
  }
  return parts.join(' ');
}

export function pfbackupArchiveOnlyValidText(): string {
  return 'Backup-Datei ist formal in Ordnung, aber Settings sind für Restore nicht importierbar.';
}

export function stackStatusLabel(running: boolean): string {
  return running ? 'Läuft' : 'Gestoppt';
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
  return draftImports.trim() !== current.imports || draftExports.trim() !== current.exports;
}

export function storageWarningText(running: boolean, pathsChanged: boolean): string | null {
  if (running && pathsChanged) {
    return 'Neue Mounts werden erst nach einem Stack-Neustart aktiv. Beim Übernehmen wird danach gefragt.';
  }
  return null;
}

export function softwareUpdateSectionVisible(status: HostStatus | null): boolean {
  return Boolean(status?.envExists);
}

export function softwareUpdateCurrentLabel(status: HostStatus): string {
  const images = status.deliveryImages;
  const release = images.releaseVersion?.trim();
  if (release) {
    return release;
  }
  if (images.ready && images.appImage && images.sandboxImage) {
    const appTag = images.appImage.split(':').pop() ?? images.appImage;
    const sandboxTag = images.sandboxImage.split(':').pop() ?? images.sandboxImage;
    if (appTag === sandboxTag) {
      return appTag;
    }
    return `${appTag} (app) · ${sandboxTag} (sandbox)`;
  }
  return deliveryImagesSummary(status);
}

export function softwareUpdateInfoRows(status: HostStatus): MaintenanceInfoRow[] {
  return [{ label: 'Aktuell', value: softwareUpdateCurrentLabel(status) }];
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
