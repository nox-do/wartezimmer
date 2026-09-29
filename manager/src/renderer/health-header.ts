import { runtimeSnapshot, type RuntimeObservation } from './runtime-observation.js';
import type { ComposeServiceStatus, ProbeResult } from '../shared/host-status.js';
import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';
import { probeLabel } from './probe-label.js';
import { sandboxClamAvChip } from './sandbox-scanner-ui.js';

type ReachabilityStatus = 'ok' | 'warn' | 'bad' | null;

function sandboxChips(scanner: HostRuntimeHealth['sandboxScanner']): HealthTileChip[] | undefined {
  const chip = sandboxClamAvChip(scanner);
  return chip ? [chip] : undefined;
}

function isServiceRunning(service: ComposeServiceStatus): boolean {
  return service.state.toLowerCase().includes('running');
}

/** Ampel from Compose: container running + Docker health. */
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

/**
 * Entry-aware ampel: Compose must be up; green only when canonical health probe succeeds.
 * Port/container up but entry fail → yellow.
 */
function withEntryProbe(
  stackStatus: ReachabilityStatus,
  lanProbe: ProbeResult | undefined,
  probesPending: boolean,
): ReachabilityStatus {
  if (stackStatus === 'bad' || stackStatus === null) {
    return stackStatus;
  }
  if (stackStatus === 'warn') {
    return 'warn';
  }
  if (probesPending || !lanProbe) {
    return 'warn';
  }
  return lanProbe.ok ? 'ok' : 'warn';
}

function entryDetail(
  stackDetail: string,
  lanProbe: ProbeResult | undefined,
  probesPending: boolean,
  status: ReachabilityStatus,
): string {
  if (status !== 'warn') {
    return stackDetail;
  }
  if (probesPending || !lanProbe) {
    return `${stackDetail} — Einstieg wird geprüft …`;
  }
  if (!lanProbe.ok) {
    if (lanProbe.reason === 'dns-rebind') {
      return `${stackDetail} — DNS-Rebind-Schutz oder lokaler DNS-Filter möglich`;
    }
    return `${stackDetail} — Einstieg nicht erreichbar`;
  }
  return stackDetail;
}

/** Entry path is owned by the proxy only while PROXY is enabled (not leftover containers). */
function proxyOwnsEntry(runtime: HostRuntimeHealth): boolean {
  return Boolean(runtime.proxyServer?.enabled);
}

export type HealthTileChip = {
  label: string;
  ok: boolean | null;
  neutral?: boolean;
  /** Yellow chip (e.g. ClamAV definitions outdated) — overrides red when ok is false. */
  warn?: boolean;
};

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
  const probesPending =
    probes.length === 0 && runtime.docker.daemonRunning && Boolean(runtime.compose?.running);
  const lanProbe = probesById.get('app.health.lan');
  const scanner = runtime.sandboxScanner;
  const useProxyEntry = proxyOwnsEntry(runtime);
  const tiles: HealthTileSpec[] = [];

  if (services.length === 0 && !useProxyEntry) {
    tiles.push({
      name: 'Stack',
      detail:
        runtime.compose === null
          ? 'Containerstatus nicht prüfbar'
          : probesPending
            ? 'Wird geprüft …'
            : 'Keine Container',
      status: null,
    });
    return tiles;
  }

  for (const service of services) {
    const serviceName = service.service || service.name;
    if (serviceName === 'proxy') {
      // Dedicated Proxy-Server tile below.
      continue;
    }

    const stackStatus = composeServiceStatus(service);
    const stackDetail = composeServiceDetail(service);

    if (serviceName === 'app') {
      if (useProxyEntry) {
        tiles.push({
          name: serviceName,
          detail: stackDetail,
          status: stackStatus,
        });
      } else {
        const status = withEntryProbe(stackStatus, lanProbe, probesPending);
        tiles.push({
          name: serviceName,
          detail: entryDetail(stackDetail, lanProbe, probesPending, status),
          status,
        });
      }
      continue;
    }

    if (serviceName === 'sandbox') {
      tiles.push({
        name: serviceName,
        detail: stackDetail,
        status: stackStatus,
        chips: sandboxChips(scanner),
      });
      continue;
    }

    tiles.push({
      name: serviceName,
      detail: stackDetail,
      status: stackStatus,
    });
  }

  if (runtime.proxyServer?.enabled) {
    const container = runtime.proxyServer.container;
    if (container) {
      const stackStatus = composeServiceStatus(container);
      const stackDetail = composeServiceDetail(container);
      const status = withEntryProbe(stackStatus, lanProbe, probesPending);
      tiles.push({
        name: 'Proxy-Server',
        detail: entryDetail(stackDetail, lanProbe, probesPending, status),
        status,
      });
    } else {
      tiles.push({
        name: 'Proxy-Server',
        detail: 'Container fehlt',
        status: 'bad',
      });
    }
  }

  const hasApp = services.some((service) => (service.service || service.name) === 'app');
  const entryOwnedByTile = hasApp || useProxyEntry;
  for (const probe of probes) {
    if (entryOwnedByTile && ['app.health.local', 'app.health.lan'].includes(probe.id)) {
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

/** Retain last-known tiles, but never present stale evidence with a green light. */
export function collectObservedHealthTiles(observation: RuntimeObservation): HealthTileSpec[] {
  const snapshot = runtimeSnapshot(observation);
  if (!snapshot) return [];
  const tiles = collectHealthTiles(snapshot);
  if (observation.kind !== 'stale') return tiles;
  return tiles.map((tile) => ({
    ...tile,
    status: null,
    detail: `Veraltet — ${tile.detail}`,
    chips: tile.chips?.map((chip) => ({ ...chip, neutral: true })),
  }));
}
