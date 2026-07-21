import { formatEnvBackupLabel } from '@praxis-flow/server-shared/env-backup';
import type { HostNetworkResult, HostStatus } from '../shared/host-status.js';

export const NETWORK_SAVE_PROGRESS_TEXT = 'Speichern …';
export const NETWORK_SAVE_PROGRESS_RESTART_TEXT = 'Speichern und Stack neu starten …';
export const NETWORK_SAVE_PROGRESS_PROXY_TEXT =
  'Speichern und Proxy-Server starten … (Image prüfen, Compose)';
export const NETWORK_SAVE_PROGRESS_PROXY_RESTORE_TEXT =
  'Proxy wiederherstellen … (Image prüfen, Compose)';
export const NETWORK_NO_CHANGES_ERROR = 'Keine Änderungen an LAN oder Proxy-Server.';
export const NETWORK_RESTART_CONFIRM_MESSAGE =
  'Einstellungen werden gespeichert. Stack jetzt neu starten, damit die Änderungen greifen?';
export const NETWORK_RESTART_CONFIRM_PROXY_MESSAGE =
  'Einstellungen werden gespeichert und der Stack neu gestartet — der Proxy-Server startet dabei mit. Fortfahren?';
export const NETWORK_PROXY_RESTORE_CONFIRM_MESSAGE =
  'Proxy-Image prüfen und Stack mit Proxy-Server starten? Bestehende Container werden neu gestartet.';
export const NETWORK_PROXY_RESTORE_HINT =
  'Proxy ist aktiviert, aber der Container läuft nicht (Image oder Container fehlt). Mit „Proxy wiederherstellen“ Image prüfen und starten — oder Proxy abschalten und übernehmen.';
export const NETWORK_LAN_REQUIRED_ERROR = 'Bitte eine LAN-Adresse wählen oder eingeben.';

/** Configured proxy without a running container — recoverable via restore action. */
export function proxyNeedsRestore(status: HostStatus | null | undefined): boolean {
  if (!status?.proxy?.enabled) {
    return false;
  }
  const state = status.proxy.container?.state?.toLowerCase() ?? '';
  return !state.includes('running');
}

export function networkRestartConfirmMessage(proxyChanging: boolean): string {
  return proxyChanging ? NETWORK_RESTART_CONFIRM_PROXY_MESSAGE : NETWORK_RESTART_CONFIRM_MESSAGE;
}

export function networkSaveProgressText(input: {
  restartCompose: boolean;
  enablingProxy: boolean;
  repairingProxy?: boolean;
}): string {
  if (input.repairingProxy) {
    return NETWORK_SAVE_PROGRESS_PROXY_RESTORE_TEXT;
  }
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
  options?: { proxyEnabled?: boolean; repairingProxy?: boolean },
): string {
  const parts = [
    options?.repairingProxy
      ? 'Proxy-Wiederherstellung abgeschlossen.'
      : 'Netzwerk-Konfiguration gespeichert.',
  ];
  if (result.backupPath) {
    parts.push(`Backup: ${formatEnvBackupLabel(result.backupPath)}`);
  }
  if (result.composeRestarted) {
    parts.push(options?.repairingProxy ? 'Stack gestartet.' : 'Stack neu gestartet.');
    if (options?.proxyEnabled) {
      parts.push(
        proxyContainerRunning(result)
          ? 'Proxy-Server läuft.'
          : 'Proxy-Server ist aktiviert, Container aber nicht sichtbar — Logs prüfen.',
      );
    }
  } else if (result.stackWasRunning && restartCompose) {
    parts.push('Stack-Neustart fehlgeschlagen.');
  } else if (options?.repairingProxy) {
    parts.push('Proxy konnte nicht gestartet werden — Image/Logs prüfen.');
  } else if (options?.proxyEnabled && !result.stackWasRunning) {
    parts.push('Proxy aktiviert — Stack unter Status starten, damit der Proxy-Server läuft.');
  }
  return parts.join(' ');
}

export function networkSaveErrorText(
  result: HostNetworkResult,
  restartCompose: boolean,
): string | null {
  if (restartCompose && !result.composeRestarted) {
    if (result.stackWasRunning || result.restartLog) {
      return result.restartLog || 'Docker Compose fehlgeschlagen.';
    }
  }
  return null;
}
