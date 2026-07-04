import type { ComposeStatus, ProbeResult } from '../shared/host-status.js';
import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';
import { probeLabel } from './probe-label.js';
import {
  aggregatedServiceStateLabel,
  sandboxClamAvChip,
  sandboxScannerReachability,
} from './sandbox-scanner-ui.js';

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

  return { text: 'Einrichtung unvollständig', level: 'warn' };
}

function sandboxChips(
  scanner: HostRuntimeHealth['sandboxScanner'],
): Array<{ label: string; ok: boolean | null; neutral?: boolean }> | undefined {
  const chip = sandboxClamAvChip(scanner);
  return chip ? [chip] : undefined;
}

function isServiceRunning(service: ComposeStatus['services'][number]): boolean {
  return service.state.toLowerCase().includes('running');
}

function serviceRowStatus(
  service: ComposeStatus['services'][number],
  scanner: HostRuntimeHealth['sandboxScanner'],
): ReachabilityStatus {
  if (!isServiceRunning(service)) {
    return 'bad';
  }

  const serviceName = service.service || service.name;
  if (serviceName === 'sandbox') {
    const scannerStatus = sandboxScannerReachability(scanner);
    if (scannerStatus) {
      return scannerStatus;
    }
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

function serviceDetail(
  service: ComposeStatus['services'][number],
  scanner: HostRuntimeHealth['sandboxScanner'],
): string {
  return aggregatedServiceStateLabel(service, scanner);
}

type ChipSpec = { label: string; ok: boolean | null; neutral?: boolean };

type TileSpec = {
  name: string;
  detail: string;
  status: ReachabilityStatus;
  chips?: ChipSpec[];
};

function collectTiles(runtime: HostRuntimeHealth): TileSpec[] {
  const services = runtime.compose?.services ?? [];
  const probes = runtime.probes;
  const probesById = new Map(probes.map((probe) => [probe.id, probe]));
  const probesPending = probes.length === 0 && runtime.docker.daemonRunning;
  const scanner = runtime.sandboxScanner;
  const tiles: TileSpec[] = [];

  if (services.length === 0) {
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
    tiles.push({
      name: serviceName,
      detail: serviceDetail(service, scanner),
      status: serviceRowStatus(service, scanner),
      chips: serviceChips(serviceName, probesById, probesPending, scanner),
    });
  }

  const hasApp = services.some((service) => (service.service || service.name) === 'app');
  for (const probe of probes) {
    if (hasApp && ['app.health.local', 'app.health.lan'].includes(probe.id)) {
      continue;
    }
    let detail = probe.message;
    if (probe.id === 'app.health.lan' && runtime.configuredLanIp) {
      detail = `${probe.message} — ${runtime.configuredLanIp}:8080`;
    }
    tiles.push({
      name: probeLabel(probe.id),
      detail,
      status: probe.ok ? 'ok' : 'bad',
    });
  }

  return tiles;
}

function appendTile(container: HTMLElement, tile: TileSpec): void {
  const el = document.createElement('article');
  el.className = 'health-tile';

  const head = document.createElement('div');
  head.className = 'health-tile-head';

  const dot = document.createElement('span');
  dot.className = tile.status === null ? 'probe-dot' : `probe-dot ${tile.status}`;
  dot.setAttribute('aria-hidden', 'true');

  const name = document.createElement('span');
  name.className = 'health-tile-name';
  name.textContent = tile.name;

  head.append(dot, name);

  const detail = document.createElement('p');
  detail.className =
    tile.status === 'warn' ? 'health-tile-detail is-warn' : 'health-tile-detail';
  detail.textContent = tile.detail;

  el.append(head, detail);

  if (tile.chips && tile.chips.length > 0) {
    const chips = document.createElement('div');
    chips.className = 'health-tile-chips';
    for (const chip of tile.chips) {
      const badge = document.createElement('span');
      if (chip.neutral) {
        badge.className = 'reachability-chip is-neutral';
        badge.textContent = chip.label;
      } else {
        badge.className =
          chip.ok === null
            ? 'reachability-chip is-pending'
            : `reachability-chip ${chip.ok ? 'is-ok' : 'is-bad'}`;
        badge.textContent = chip.ok === null ? `${chip.label} …` : chip.label;
      }
      chips.append(badge);
    }
    el.append(chips);
  }

  container.append(el);
}

export function createHealthHeader(root: HTMLElement) {
  const banner = root.querySelector<HTMLElement>('#health-banner');
  const tiles = root.querySelector<HTMLElement>('#health-tiles');

  if (!banner || !tiles) {
    throw new Error('Health-Header: Banner oder Kacheln fehlen.');
  }

  const bannerEl = banner;
  const tilesEl = tiles;

  function render(runtime: HostRuntimeHealth): void {
    const overall = deriveOverallStatus(runtime);
    bannerEl.textContent = overall.text;
    bannerEl.className = `health-banner is-${overall.level}`;

    tilesEl.replaceChildren();
    for (const tile of collectTiles(runtime)) {
      appendTile(tilesEl, tile);
    }
  }

  function renderError(message: string): void {
    bannerEl.textContent = 'Unbekannt';
    bannerEl.className = 'health-banner is-bad';
    tilesEl.replaceChildren();
    const tile = document.createElement('article');
    tile.className = 'health-tile health-tile-error';
    tile.textContent = message || 'Setup-API nicht erreichbar — bitte Manager neu starten.';
    tilesEl.append(tile);
  }

  return {
    render,
    renderError,
    show(): void {
      root.hidden = false;
    },
    hide(): void {
      root.hidden = true;
    },
  };
}
