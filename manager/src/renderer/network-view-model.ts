import type {
  HostNetworkResult,
  HostStatus,
  NetworkBindingCheck,
  ProbeResult,
} from '../shared/host-status.js';
import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';
import type { LanIpFieldState, ProxyFieldState } from './host-network-panels.js';
import { effectiveProxyContainer } from './host-snapshot-selectors.js';
import { resolvedLanIp } from './wizard-state.js';

/** In-flight phases only — outcomes live in NetworkNotice. */
export type NetworkPhase = 'idle' | 'loading' | 'saving' | 'restarting' | 'checking';

export type NetworkNotice =
  | { tone: 'success'; message: string }
  | { tone: 'warning'; message: string }
  | { tone: 'error'; message: string };

export type NetworkDraft = LanIpFieldState & ProxyFieldState;

export const NETWORK_LAN_REQUIRED_ERROR =
  'Bitte eine Adresse dieses Rechners wählen oder eingeben.';
export const NETWORK_RESTART_CONFIRM_MESSAGE =
  'Einstellungen speichern und Wartezimmer neu starten, damit die Änderung wirksam wird?';
export const NETWORK_RESTART_CONFIRM_PROXY_MESSAGE =
  'Einstellungen speichern und Wartezimmer neu starten? Der Zugriff über Port 80 wird dabei mitgestartet.';
export const NETWORK_PROXY_RESTORE_CONFIRM_MESSAGE =
  'Proxy-Dienst prüfen und starten? Wartezimmer wird dafür neu gestartet.';
export const NETWORK_PROXY_RESTORE_HINT =
  'Der Zugang ist eingerichtet, aber der Proxy-Dienst läuft nicht. Wiederherstellen verwendet die gespeicherte Einrichtung einschließlich vorhandenem HTTPS.';
export const NETWORK_STACK_STOPPED_VERIFY_HINT =
  'Wartezimmer ist gestoppt. Unter Wartung starten und danach erneut prüfen.';
export const NETWORK_PROBE_FAILED_MESSAGE =
  'Die Erreichbarkeit konnte nicht geprüft werden. Bitte kurz warten und erneut versuchen.';
export const NETWORK_PROXY_EXPANDER_TITLE = 'Zugriff über ausgewählte IP-Adresse (Proxy)';
export const NETWORK_APPLY_BUTTON_LABEL = 'Einstellungen übernehmen und prüfen';
export const NETWORK_DISCARD_BUTTON_LABEL = 'Änderungen verwerfen';

export function networkIsBusy(phase: NetworkPhase): boolean {
  return (
    phase === 'loading' || phase === 'saving' || phase === 'restarting' || phase === 'checking'
  );
}

export function networkPhaseProgressText(phase: NetworkPhase): string {
  switch (phase) {
    case 'loading':
      return 'Netzwerkdaten werden geladen …';
    case 'saving':
      return 'Einstellungen werden gespeichert …';
    case 'restarting':
      return 'Wartezimmer wird neu gestartet …';
    case 'checking':
      return 'Gespeicherte Geräte-Adresse wird geprüft …';
    default:
      return '';
  }
}

/** Configured proxy without a running container — container from runtime when available. */
export function proxyNeedsRestore(
  config: HostStatus | null | undefined,
  runtime: HostRuntimeHealth | null = null,
): boolean {
  if (!config?.proxy?.enabled) {
    return false;
  }
  if (runtime && !runtime.compose) return false;
  const container = effectiveProxyContainer(config, runtime);
  const state = container?.state?.toLowerCase() ?? '';
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
  config: HostStatus | null | undefined,
  proxyEnabled: boolean,
  runtime: HostRuntimeHealth | null = null,
): string {
  if (!proxyEnabled) {
    return 'Proxy aus · HTTP mit :8080';
  }
  if (proxyNeedsRestore(config, runtime)) {
    return 'Proxy an · Dienst läuft nicht';
  }
  return 'Proxy an · HTTP ohne Portangabe';
}

/** A new network session starts collapsed; notices remain visible above the panels. */
export function networkExpanderDefaults() {
  return {
    summaryOpen: false,
    lanOpen: false,
    proxyOpen: false,
    topologyOpen: false,
    tlsOpen: false,
    restrictedOpen: false,
  };
}

/** Shared save, but actions are only shown next to the changed draft fields. */
export function networkDraftCommitPlacement(input: {
  dirty: boolean;
  draft: NetworkDraft | null;
  status: HostStatus | null;
  lanOpen: boolean;
  proxyOpen: boolean;
  httpDraftExpandersRendered: boolean;
}): {
  lan: boolean;
  proxy: boolean;
} {
  if (!input.dirty || !input.draft || !input.status) {
    return { lan: false, proxy: false };
  }
  const lanChanged =
    resolvedLanIp(input.draft) !== (input.status.network.configuredLanIp?.trim() ?? '');
  const proxyChanged = input.draft.proxyEnabled !== Boolean(input.status.proxy?.enabled);
  // Legacy binding/canonical repairs can require a save without a field edit.
  const bindingRepair = !lanChanged && !proxyChanged;
  return {
    lan: input.lanOpen && (lanChanged || bindingRepair),
    proxy: input.httpDraftExpandersRendered && input.proxyOpen && proxyChanged,
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
    return 'Änderungen werden erst wirksam, wenn Wartezimmer neu gestartet wird. Beim Übernehmen wird danach gefragt.';
  }
  return null;
}

export function networkRestartFailureMessage(_result: HostNetworkResult): string {
  return 'Wartezimmer konnte nicht neu gestartet werden. Bitte unter Status die Dienste prüfen; technische Details finden Sie unter Wartung im Bereich „Logs“.';
}

export function networkSavedWhileStoppedMessage(): string {
  return 'Gespeichert. Die Erreichbarkeit kann geprüft werden, sobald Wartezimmer gestartet ist.';
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
export function networkProxyMissingAfterRestart(
  result: HostNetworkResult,
  proxyEnabled: boolean,
): boolean {
  return proxyEnabled && result.composeRestarted && !proxyContainerRunning(result);
}

export function dnsRebindHelp(baseUrl: string): string {
  let exception = 'den Praxis-Hostnamen';
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase().replace(/\.$/, '');
    exception =
      hostname === 'lan.notaus.de' || hostname.endsWith('.lan.notaus.de')
        ? 'lan.notaus.de'
        : hostname;
  } catch {
    /* Keep a neutral instruction if no valid address is available. */
  }
  return `DNS-Rebind-Schutz oder lokaler DNS-Filter möglich. Die lokale Namensauflösung scheitert, während ein öffentlicher DNS-Server eine private LAN-IP liefert. Prüfen Sie die DNS-Rebind-Ausnahmen im Router bzw. lokalen DNS-Filter und tragen Sie dort ${exception} als Ausnahme ein. Anschließend die Praxisadresse erneut prüfen.`;
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
        'Wartezimmer antwortet lokal noch nicht. Bitte kurz warten und die gespeicherte Adresse erneut prüfen.',
    };
  }

  if (lan && !lan.ok) {
    if (lan.reason === 'dns-rebind') {
      return { ok: false, message: dnsRebindHelp(baseUrl) };
    }
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
    message: `Gespeichert. Wartezimmer wurde neu gestartet, ist aber noch nicht erreichbar (${baseUrl}). Bitte kurz warten und erneut prüfen.`,
  };
}
