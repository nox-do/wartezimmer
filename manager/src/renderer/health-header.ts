import type { ComposeServiceStatus, ComposeStatus, ProbeResult } from '../shared/host-status.js';
import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';
import { probeLabel } from './probe-label.js';
import { sandboxClamAvChip } from './sandbox-scanner-ui.js';

type OverallLevel = 'ok' | 'warn' | 'bad';

type ReachabilityStatus = 'ok' | 'warn' | 'bad' | null;

function findProbe(probes: ProbeResult[], id: string): ProbeResult | undefined {
  return probes.find((probe) => probe.id === id);
}

export function deriveOverallStatus(
  runtime: HostRuntimeHealth,
  compose: ComposeStatus | null = runtime.compose,
): { text: string; level: OverallLevel } {
  const probes = runtime.probes;
  const localProbe = findProbe(probes, 'app.health.local');
  const lanProbe = findProbe(probes, 'app.health.lan');
  const localOk = localProbe?.ok ?? false;
  const lanOk = lanProbe?.ok ?? false;
  const ready =
    runtime.envExists &&
    runtime.docker.installed &&
    runtime.docker.daemonRunning &&
    runtime.docker.composeAvailable &&
    localOk &&
    lanOk;

  if (ready) {
    return { text: 'Betrieb', level: 'ok' };
  }

  if (!runtime.envExists || !runtime.docker.installed) {
    return { text: 'Nicht eingerichtet', level: 'bad' };
  }

  if (!runtime.configuredLanIp) {
    return { text: 'LAN noch nicht konfiguriert', level: 'warn' };
  }

  const setupComplete =
    runtime.envExists &&
    runtime.docker.installed &&
    runtime.docker.daemonRunning &&
    runtime.docker.composeAvailable;

  if (setupComplete && compose && !compose.running) {
    return { text: 'Gestoppt', level: 'warn' };
  }

  // Configured proxy without a running container — LAN probe usually fails on :80.
  if (setupComplete && runtime.proxyServer?.enabled && !runtime.proxyServer.container) {
    return { text: 'Proxy-Server fehlt', level: 'warn' };
  }

  if (setupComplete && localOk && lanProbe && !lanOk) {
    return { text: 'LAN nicht erreichbar', level: 'warn' };
  }

  return { text: 'Einrichtung unvollständig', level: 'warn' };
}

function sandboxChips(
  scanner: HostRuntimeHealth['sandboxScanner'],
): Array<{ label: string; ok: boolean | null; neutral?: boolean }> | undefined {
  const chip = sandboxClamAvChip(scanner);
  return chip ? [chip] : undefined;
}

function isServiceRunning(service: ComposeServiceStatus): boolean {
  return service.state.toLowerCase().includes('running');
}

/** Ampel for app / sandbox / proxy: Compose running + Docker health only. */
function composeServiceStatus(service: ComposeServiceStatus): ReachabilityStatus {
  if (!isServiceRunning(service)) {
    return 'bad';
  }

  const health = service.health?.toLowerCase() ?? '';
  if (!health || health === 'healthy') {
    return 'ok';
  }
  if (health.includes('starting')) {
    return 'warn';
  }
  if (health.includes('unhealthy')) {
    return 'bad';
  }
  return 'warn';
}

function composeServiceDetail(service: ComposeServiceStatus): string {
  const parts = [service.state];
  if (service.health) {
    parts.push(service.health);
  }
  return parts.join(' — ');
}

function appProbeChips(
  probesById: Map<string, ProbeResult>,
  probesPending: boolean,
): Array<{ label: string; ok: boolean | null; neutral?: boolean }> {
  if (probesPending) {
    return [
      { label: 'lokal', ok: null },
      { label: 'LAN', ok: null },
    ];
  }

  const chips: Array<{ label: string; ok: boolean | null; neutral?: boolean }> = [];
  const local = probesById.get('app.health.local');
  const lan = probesById.get('app.health.lan');

  if (local) {
    chips.push({ label: 'lokal', ok: local.ok });
  }
  if (lan) {
    chips.push({ label: 'LAN', ok: lan.ok });
  }
  return chips;
}

function serviceChips(
  serviceName: string,
  probesById: Map<string, ProbeResult>,
  probesPending: boolean,
  scanner: HostRuntimeHealth['sandboxScanner'],
): Array<{ label: string; ok: boolean | null; neutral?: boolean }> | undefined {
  if (serviceName === 'app') {
    return appProbeChips(probesById, probesPending);
  }
  if (serviceName === 'sandbox') {
    return sandboxChips(scanner);
  }
  return undefined;
}

export type HealthTileChip = { label: string; ok: boolean | null; neutral?: boolean };

export type HealthTileSpec = {
  name: string;
  detail: string;
  status: ReachabilityStatus;
  chips?: HealthTileChip[];
};

export function collectHealthTiles(runtime: HostRuntimeHealth): HealthTileSpec[] {
  const services = runtime.compose?.services ?? [];
  const probes = runtime.probes;
  const probesById = new Map(probes.map((probe) => [probe.id, probe]));
  const probesPending = probes.length === 0 && runtime.docker.daemonRunning;
  const scanner = runtime.sandboxScanner;
  const tiles: HealthTileSpec[] = [];

  if (services.length === 0 && !runtime.proxyServer) {
    tiles.push({
      name: 'Stack',
      detail: probesPending ? 'Wird geprüft …' : 'Keine Container',
      status: null,
      chips: probesPending ? appProbeChips(probesById, true) : undefined,
    });
    return tiles;
  }

  for (const service of services) {
    const serviceName = service.service || service.name;
    if (serviceName === 'proxy') {
      // Dedicated Proxy-Server tile below (only when image present + used).
      continue;
    }
    tiles.push({
      name: serviceName,
      detail: composeServiceDetail(service),
      status: composeServiceStatus(service),
      chips: serviceChips(serviceName, probesById, probesPending, scanner),
    });
  }

  if (runtime.proxyServer) {
    const container = runtime.proxyServer.container;
    if (container) {
      tiles.push({
        name: 'Proxy-Server',
        detail: composeServiceDetail(container),
        status: composeServiceStatus(container),
      });
    } else {
      tiles.push({
        name: 'Proxy-Server',
        detail: runtime.proxyServer.enabled ? 'Container fehlt' : 'Gestoppt',
        status: 'bad',
      });
    }
  }

  const hasApp = services.some((service) => (service.service || service.name) === 'app');
  for (const probe of probes) {
    if (hasApp && ['app.health.local', 'app.health.lan'].includes(probe.id)) {
      continue;
    }
    let detail = probe.message;
    if (probe.id === 'app.health.lan' && (runtime.appBaseUrl || runtime.configuredLanIp)) {
      const target = runtime.appBaseUrl ?? `${runtime.configuredLanIp}:8080`;
      detail = `${probe.message} — ${target}`;
    }
    tiles.push({
      name: probeLabel(probe.id),
      detail,
      status: probe.ok ? 'ok' : 'bad',
    });
  }

  return tiles;
}
