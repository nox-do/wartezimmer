import type { HostStatus } from '../shared/host-status.js';
import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';
import { dnsRebindHelp } from './network-view-model.js';
import { restrictedNetworkStatusSummary } from './restricted-network-view-model.js';
import { hostLifecycleSummary } from './host-lifecycle-view-model.js';

/** Presentation only: saved configuration and observed runtime remain separate. */
export function networkAccessSummary(
  status: HostStatus,
  runtime: HostRuntimeHealth | null = null,
  runtimeError: string | null = null,
) {
  const lifecycle = status.installation?.kind === 'inconsistent' ? undefined : status.lifecycle;
  const mode = lifecycle?.assessment === 'known' ? lifecycle.mode : null;
  const configured = mode !== null && mode !== 'uninstalled';
  const proxy = configured ? mode !== 'direct-http' : null;
  const tls = configured ? mode === 'https' || mode === 'https-portal' : null;
  const lifecycleSummary = lifecycle ? hostLifecycleSummary(lifecycle) : null;
  const ip = status.network.configuredLanIp;
  const adapter = status.network.currentLanCandidates.find((item) => item.address === ip);
  const checks = status.networkBindings.filter((check) => !check.id.startsWith('gateway.'));
  const failure = checks.find((check) => !check.ok);
  const diagnosis = !ip
    ? 'Praxisadresse auswählen'
    : status.network.lanIpStale
      ? 'Die konfigurierte Praxisadresse ist am Rechner nicht vorhanden'
      : (failure?.message ??
        (checks.length ? 'Keine Abweichung erkannt' : 'Host-Bindings noch nicht geprüft'));
  return {
    operatingMode: lifecycleSummary?.title ?? null,
    portalState: lifecycle
      ? (lifecycleSummary?.operation ??
        (!configured
          ? 'Nicht sicher bestimmbar'
          : mode === 'https-portal'
            ? null
            : lifecycle.preparation === 'portal'
              ? 'Vorbereitet – noch nicht aktiviert'
              : 'Separater Portalzugang nicht aktiviert'))
      : null,
    dnsWarning:
      !runtimeError &&
      (runtime?.probes ?? status.probes).some(
        (probe) => probe.id === 'app.health.lan' && !probe.ok && probe.reason === 'dns-rebind',
      )
        ? dnsRebindHelp(
            runtime?.appBaseUrl || status.configuredCanonicalBaseUrl || status.appBaseUrl,
          )
        : null,
    diagnosis,
    needsAttention: Boolean(
      runtimeError ||
      !ip ||
      status.network.lanIpStale ||
      failure ||
      (lifecycle && lifecycle.assessment !== 'known'),
    ),
    address: status.configuredCanonicalBaseUrl || status.appBaseUrl,
    adapter: adapter
      ? `${adapter.address} (${adapter.interfaceName})`
      : ip
        ? `${ip} – Adapter nicht zugeordnet`
        : 'Noch nicht gewählt',
    connection:
      tls === null
        ? 'Nicht sicher bestimmbar'
        : tls
          ? 'HTTPS eingerichtet'
          : 'HTTP · nicht verschlüsselt',
    access:
      proxy === null
        ? 'Kein verlässlich bestimmter Zugang'
        : proxy
          ? `Ausgewählte IPv4: ${ip || 'fehlt'}`
          : 'Initialer Betriebsmodus · alle Netzwerkanschlüsse · Port 8080',
    proxy,
    tls,
  };
}

/** Actionable network findings stay visible even when network details are collapsed. */
export function networkAccessAlerts(
  status: HostStatus,
  runtime: HostRuntimeHealth | null = null,
  runtimeError: string | null = null,
): string[] {
  const summary = networkAccessSummary(status, runtime, runtimeError);
  const alerts: string[] = [];
  if (runtimeError) alerts.push(runtimeError);
  else if (status.lifecycle && status.lifecycle.assessment !== 'known')
    alerts.push(summary.operatingMode ?? 'Netzwerkkonfiguration nicht sicher bestimmbar');
  else if (summary.needsAttention) alerts.push(summary.diagnosis);
  if (summary.dnsWarning) alerts.push(summary.dnsWarning);
  if (status.restrictedNetwork) {
    const restricted = restrictedNetworkStatusSummary(status.restrictedNetwork);
    if (restricted.needsAttention) alerts.push(`Patientenzugang: ${restricted.state}.`);
  }
  return [...new Set(alerts)];
}
