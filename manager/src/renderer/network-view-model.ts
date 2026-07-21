import { formatEnvBackupLabel } from '@praxis-flow/server-shared/env-backup';
import type { HostNetworkResult } from '../shared/host-status.js';

export const NETWORK_SAVE_PROGRESS_TEXT = 'Speichern …';
export const NETWORK_SAVE_PROGRESS_RESTART_TEXT = 'Speichern und Stack neu starten …';
export const NETWORK_SAVE_PROGRESS_PROXY_TEXT =
  'Speichern und Proxy-Server starten … (Image prüfen, Compose)';
export const NETWORK_NO_CHANGES_ERROR = 'Keine Änderungen an LAN oder Proxy-Server.';
export const NETWORK_RESTART_CONFIRM_MESSAGE =
  'Einstellungen werden gespeichert. Stack jetzt neu starten, damit die Änderungen greifen?';
export const NETWORK_RESTART_CONFIRM_PROXY_MESSAGE =
  'Einstellungen werden gespeichert und der Stack neu gestartet — der Proxy-Server startet dabei mit. Fortfahren?';
export const NETWORK_LAN_REQUIRED_ERROR = 'Bitte eine LAN-Adresse wählen oder eingeben.';

export function networkRestartConfirmMessage(proxyChanging: boolean): string {
  return proxyChanging ? NETWORK_RESTART_CONFIRM_PROXY_MESSAGE : NETWORK_RESTART_CONFIRM_MESSAGE;
}

export function networkSaveProgressText(input: {
  restartCompose: boolean;
  enablingProxy: boolean;
}): string {
  if (input.restartCompose && input.enablingProxy) {
    return NETWORK_SAVE_PROGRESS_PROXY_TEXT;
  }
  if (input.restartCompose) {
    return NETWORK_SAVE_PROGRESS_RESTART_TEXT;
  }
  return NETWORK_SAVE_PROGRESS_TEXT;
}

export function networkWarningText(running: boolean, changed: boolean): string | null {
  if (running && changed) {
    return 'Änderungen werden erst nach einem Stack-Neustart wirksam. Beim Übernehmen wird danach gefragt.';
  }
  return null;
}

function proxyContainerRunning(result: HostNetworkResult): boolean {
  const proxy = result.compose?.services.find(
    (service) => (service.service || service.name) === 'proxy',
  );
  const state = proxy?.state?.toLowerCase() ?? '';
  return state.includes('running');
}

export function networkSaveStatusText(
  result: HostNetworkResult,
  restartCompose: boolean,
  options?: { proxyEnabled?: boolean },
): string {
  const parts = ['Netzwerk-Konfiguration gespeichert.'];
  if (result.backupPath) {
    parts.push(`Backup: ${formatEnvBackupLabel(result.backupPath)}`);
  }
  if (result.composeRestarted) {
    parts.push('Stack neu gestartet.');
    if (options?.proxyEnabled) {
      parts.push(
        proxyContainerRunning(result)
          ? 'Proxy-Server läuft.'
          : 'Proxy-Server ist aktiviert, Container aber nicht sichtbar — Logs prüfen.',
      );
    }
  } else if (result.stackWasRunning && restartCompose) {
    parts.push('Stack-Neustart fehlgeschlagen.');
  } else if (options?.proxyEnabled && !result.stackWasRunning) {
    parts.push('Proxy aktiviert — Stack unter Status starten, damit der Proxy-Server läuft.');
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
