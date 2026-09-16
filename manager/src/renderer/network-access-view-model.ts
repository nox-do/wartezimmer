import type { HostStatus } from '../shared/host-status.js';
import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';
import { effectiveProxyContainer } from './host-snapshot-selectors.js';
import { dnsRebindHelp } from './network-view-model.js';

/** Presentation only: saved configuration and observed runtime remain separate. */
export function networkAccessSummary(
  status: HostStatus,
  runtime: HostRuntimeHealth | null = null,
  runtimeError: string | null = null,
) {
  const proxy = status.proxy.enabled;
  const tls = Boolean(status.tls?.cutoverApplied);
  const ip = status.network.configuredLanIp;
  const adapter = status.network.currentLanCandidates.find((item) => item.address === ip);
  const compose = runtime ? runtime.compose : status.compose;
  const docker = runtime ? runtime.docker : status.docker;
  const container = effectiveProxyContainer(status, runtime);
  const services = compose?.services ?? [];
  let operation = 'Laufzustand unbekannt';
  if (runtimeError) operation = 'Laufzustand konnte nicht aktualisiert werden';
  else if (!docker.daemonRunning) operation = 'Docker ist nicht erreichbar';
  else if (!compose)
    operation = 'Laufzustand unbekannt – Docker-Dienste konnten nicht geprüft werden';
  else if (services.some((service) => service.health?.toLowerCase() === 'starting'))
    operation = 'Dienste starten – Prüfung läuft';
  else if (services.some((service) => service.health?.toLowerCase() === 'unhealthy'))
    operation = 'Ein Dienst meldet eine Störung';
  else if (
    services.length > 0 &&
    services.every((service) => !service.state.toLowerCase().includes('running'))
  )
    operation = 'Praxis Flow ist gestoppt';
  else if (proxy && !container?.state.toLowerCase().includes('running'))
    operation = 'Zugriff eingerichtet – Proxy-Dienst läuft nicht';
  else if (compose?.running) operation = 'Dienste laufen';
  else if (services.some((service) => service.state.toLowerCase().includes('running')))
    operation = 'Dienste sind teilweise gestartet';
  else if (compose) operation = 'Praxis Flow ist gestoppt';

  const checks = status.networkBindings.filter((check) => !check.id.startsWith('gateway.'));
  const failure = checks.find((check) => !check.ok);
  const diagnosis = !ip
    ? 'Praxisadresse auswählen'
    : status.network.lanIpStale
      ? 'Die konfigurierte Praxisadresse ist am Rechner nicht vorhanden'
      : (failure?.message ??
        (checks.length ? 'Keine Abweichung erkannt' : 'Host-Bindings noch nicht geprüft'));
  return {
    dnsWarning: !runtimeError && (runtime?.probes ?? status.probes).some(
      (probe) => probe.id === 'app.health.lan' && !probe.ok && probe.reason === 'dns-rebind',
    ) ? dnsRebindHelp(runtime?.appBaseUrl || status.configuredCanonicalBaseUrl || status.appBaseUrl) : null,
    operation,
    diagnosis,
    needsAttention: Boolean(runtimeError || !ip || status.network.lanIpStale || failure),
    address: status.configuredCanonicalBaseUrl || status.appBaseUrl,
    adapter: adapter
      ? `${adapter.address} (${adapter.interfaceName})`
      : ip
        ? `${ip} – Adapter nicht zugeordnet`
        : 'Noch nicht gewählt',
    connection: tls ? 'HTTPS eingerichtet' : 'HTTP · nicht verschlüsselt',
    access: proxy
      ? `Ausgewählte IPv4: ${ip || 'fehlt'}`
      : 'Initialer Betriebsmodus · alle Netzwerkanschlüsse · Port 8080',
    proxy,
    tls,
  };
}
