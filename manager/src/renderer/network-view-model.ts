import type {
  HostNetworkResult,
  HostStatus,
  NetworkBindingCheck,
  ProbeResult,
} from '../shared/host-status.js';
import type { LanIpFieldState } from './host-network-panels.js';
import { resolvedLanIp } from './wizard-state.js';

export type NetworkOperation =
  | 'idle'
  | 'loading'
  | 'saving'
  | 'restarting'
  | 'checking'
  | 'success'
  | 'failed';

export const NETWORK_NO_CHANGES_HINT = 'Keine Änderungen an LAN, Proxy oder Geräte-Adresse.';
export const NETWORK_LAN_REQUIRED_ERROR = 'Bitte eine Adresse dieses Rechners wählen oder eingeben.';
export const NETWORK_RESTART_CONFIRM_MESSAGE =
  'Einstellungen speichern und Praxis Flow neu starten, damit die Änderung wirksam wird?';
export const NETWORK_RESTART_CONFIRM_PROXY_MESSAGE =
  'Einstellungen speichern und Praxis Flow neu starten? Der Zugriff über Port 80 wird dabei mitgestartet.';
export const NETWORK_PROXY_RESTORE_CONFIRM_MESSAGE =
  'Proxy-Dienst prüfen und starten? Praxis Flow wird dafür neu gestartet.';
export const NETWORK_PROXY_RESTORE_HINT =
  'Zugriff über Port 80 ist eingeschaltet, aber der Proxy-Dienst läuft nicht. Hier wiederherstellen oder den Zugriff wieder ausschalten und übernehmen.';
export const NETWORK_STACK_STOPPED_VERIFY_HINT =
  'Praxis Flow ist gestoppt. Unter Status starten und danach erneut prüfen.';
export const NETWORK_PROBE_FAILED_MESSAGE =
  'Die Erreichbarkeit konnte nicht geprüft werden. Bitte kurz warten und erneut versuchen.';

export function networkIsBusy(operation: NetworkOperation): boolean {
  return (
    operation === 'loading' ||
    operation === 'saving' ||
    operation === 'restarting' ||
    operation === 'checking'
  );
}

export function networkOperationProgressText(operation: NetworkOperation): string {
  switch (operation) {
    case 'loading':
      return 'Netzwerkdaten werden geladen …';
    case 'saving':
      return 'Einstellungen werden gespeichert …';
    case 'restarting':
      return 'Praxis Flow wird neu gestartet …';
    case 'checking':
      return 'Gespeicherte Geräte-Adresse wird geprüft …';
    default:
      return '';
  }
}

/** Configured proxy without a running container — recoverable via restore action. */
export function proxyNeedsRestore(status: HostStatus | null | undefined): boolean {
  if (!status?.proxy?.enabled) {
    return false;
  }
  const state = status.proxy.container?.state?.toLowerCase() ?? '';
  return !state.includes('running');
}

/**
 * Network-tab display: omit leftover openNDS gateway.* binding checks.
 * TODO(setup): stop emitting gateway checks from auditNetworkBindings once GATEWAY_*
 * is fully cleared from installs (save already disables gateway on network apply).
 */
export function networkHostChecksForDisplay(
  checks: NetworkBindingCheck[] | null | undefined,
): NetworkBindingCheck[] {
  return (checks ?? []).filter((check) => !check.id.startsWith('gateway.'));
}

export function networkHostChecksHaveFailures(checks: NetworkBindingCheck[]): boolean {
  return checks.some((check) => !check.ok);
}

export function networkHostChecksSubtitle(checks: NetworkBindingCheck[]): string {
  if (checks.length === 0) {
    return 'Keine Host-Prüfungen';
  }
  const failed = checks.filter((check) => !check.ok).length;
  if (failed === 0) {
    return `${checks.length} ok`;
  }
  return `${checks.length - failed} ok · ${failed} Fehler`;
}

export function networkLanSubtitle(
  status: HostStatus | null | undefined,
  fields: LanIpFieldState,
): string {
  const ip = resolvedLanIp(fields) || status?.network.configuredLanIp?.trim() || '';
  if (!ip) {
    return 'Adresse dieses Rechners wählen';
  }
  if (status?.network.lanIpStale) {
    return `${ip} — stimmt nicht mehr mit diesem Rechner überein`;
  }
  return ip;
}

export function networkProxySubtitle(
  status: HostStatus | null | undefined,
  proxyEnabled: boolean,
): string {
  if (!proxyEnabled) {
    return 'Aus — Geräte-Adresse mit :8080';
  }
  if (proxyNeedsRestore(status)) {
    return 'An — Proxy-Dienst fehlt';
  }
  return 'An — Geräte-Adresse ohne :8080 (Port 80)';
}

export function networkReachabilitySubtitle(status: HostStatus | null | undefined): string {
  return (
    status?.configuredCanonicalBaseUrl ||
    status?.deviceUrls?.appBaseUrl ||
    status?.appBaseUrl ||
    'Adresse für Terminal, TV und MFA wählen'
  );
}

/** Default expander open flags for a Network-tab session (IT action order). */
export function networkExpanderDefaults(input: {
  status: HostStatus;
  proxyEnabled: boolean;
}): {
  lanOpen: boolean;
  proxyOpen: boolean;
  reachabilityOpen: boolean;
  checksOpen: boolean;
  topologyOpen: boolean;
} {
  const checks = networkHostChecksForDisplay(input.status.networkBindings);
  return {
    lanOpen: Boolean(input.status.network.lanIpStale) || !input.status.network.configuredLanIp,
    proxyOpen: input.proxyEnabled && proxyNeedsRestore(input.status),
    reachabilityOpen: true,
    checksOpen: networkHostChecksHaveFailures(checks),
    topologyOpen: false,
  };
}

export function networkRestartConfirmMessage(proxyChanging: boolean): string {
  return proxyChanging ? NETWORK_RESTART_CONFIRM_PROXY_MESSAGE : NETWORK_RESTART_CONFIRM_MESSAGE;
}

export function savedDeviceBaseUrl(status: HostStatus | null | undefined): string | null {
  const url =
    status?.configuredCanonicalBaseUrl?.trim() ||
    status?.deviceUrls?.appBaseUrl?.trim() ||
    status?.appBaseUrl?.trim() ||
    '';
  return url || null;
}

export function networkWarningText(running: boolean, changed: boolean): string | null {
  if (running && changed) {
    return 'Änderungen werden erst wirksam, wenn Praxis Flow neu gestartet wird. Beim Übernehmen wird danach gefragt.';
  }
  return null;
}

export function networkRestartFailureMessage(result: HostNetworkResult): string {
  const detail = result.restartLog?.trim();
  if (detail) {
    return `Praxis Flow konnte nicht neu gestartet werden. ${summarizeTechnicalDetail(detail)}`;
  }
  return 'Praxis Flow konnte nicht neu gestartet werden. Bitte unter Status die Container prüfen.';
}

export function networkSavedWhileStoppedMessage(): string {
  return 'Gespeichert. Die Erreichbarkeit kann geprüft werden, sobald Praxis Flow gestartet ist.';
}

export function networkProxyStartFailureMessage(): string {
  return 'Der Proxy-Dienst konnte nicht gestartet werden. Proxy deaktivieren oder oben wiederherstellen.';
}

function proxyContainerRunning(result: HostNetworkResult): boolean {
  const proxy = result.compose?.services.find(
    (service) => (service.service || service.name) === 'proxy',
  );
  const state = proxy?.state?.toLowerCase() ?? '';
  return state.includes('running');
}

/** After save+restart: proxy enabled but container still missing. */
export function networkProxyMissingAfterRestart(result: HostNetworkResult, proxyEnabled: boolean): boolean {
  return proxyEnabled && result.composeRestarted && !proxyContainerRunning(result);
}

export function formatActiveReachabilityResult(
  probes: ProbeResult[],
  baseUrl: string,
): { ok: boolean; message: string } {
  const local = probes.find((probe) => probe.id === 'app.health.local');
  const lan = probes.find((probe) => probe.id === 'app.health.lan');

  if (local && !local.ok) {
    return {
      ok: false,
      message:
        'Praxis Flow antwortet lokal noch nicht. Bitte kurz warten und die gespeicherte Adresse erneut prüfen.',
    };
  }

  if (lan && !lan.ok) {
    return {
      ok: false,
      message: `Lokal erreichbar, aber nicht über das Praxisnetz (${baseUrl}). IP-Adresse und Firewall prüfen.`,
    };
  }

  if (lan?.ok || (!lan && local?.ok)) {
    return { ok: true, message: `Gespeichert und erreichbar: ${baseUrl}` };
  }

  return {
    ok: false,
    message: `Gespeichert. Praxis Flow wurde neu gestartet, ist aber noch nicht erreichbar (${baseUrl}). Bitte kurz warten und erneut prüfen.`,
  };
}

function summarizeTechnicalDetail(detail: string): string {
  const oneLine = detail.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= 160) {
    return oneLine;
  }
  return `${oneLine.slice(0, 157)}…`;
}
