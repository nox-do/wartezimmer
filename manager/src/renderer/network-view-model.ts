import { formatEnvBackupLabel } from '@praxis-flow/server-shared';
import type { HostNetworkResult } from '../shared/host-status.js';

export const NETWORK_SAVE_PROGRESS_TEXT = 'Speichern …';
export const NETWORK_NO_CHANGES_ERROR = 'Keine Änderungen an LAN oder Gateway.';
export const NETWORK_RESTART_CONFIRM_MESSAGE =
  'Einstellungen werden in die .env geschrieben. Stack jetzt neu starten, damit Container und URLs greifen?';
export const NETWORK_LAN_REQUIRED_ERROR = 'Bitte eine LAN-IP wählen oder eingeben.';
export const NETWORK_GATEWAY_INTERFACE_ERROR =
  'Bitte ein Netzwerk-Interface für das Gast-LAN wählen.';

export function networkWarningText(running: boolean, changed: boolean): string | null {
  if (running && changed) {
    return 'Änderungen werden erst nach einem Stack-Neustart wirksam. Beim Übernehmen wird danach gefragt.';
  }
  return null;
}

export function networkSaveStatusText(
  result: HostNetworkResult,
  restartCompose: boolean,
): string {
  const parts = ['Netzwerk-Konfiguration gespeichert.'];
  if (result.backupPath) {
    parts.push(`Backup: ${formatEnvBackupLabel(result.backupPath)}`);
  }
  if (result.gatewayComposeSkipped) {
    parts.push(
      'Gateway-Dienst auf diesem Praxis-PC übersprungen; Werte für separates Linux-Gateway gespeichert.',
    );
  }
  if (result.composeRestarted) {
    parts.push('Stack neu gestartet.');
  } else if (result.stackWasRunning && restartCompose) {
    parts.push('Stack-Neustart fehlgeschlagen.');
  }
  return parts.join(' ');
}

export function networkSaveErrorText(
  result: HostNetworkResult,
  restartCompose: boolean,
): string | null {
  if (result.stackWasRunning && restartCompose && !result.composeRestarted) {
    return result.restartLog || 'Docker Compose fehlgeschlagen.';
  }
  return null;
}
