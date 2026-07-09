import type { HostStatus, NetworkSnapshot } from '../shared/host-status.js';
import type { LanIpFieldState } from './host-network-panels.js';
import { resolvedLanIp } from './wizard-state.js';

export const DEFAULT_APP_PUBLISH_PORT = 8080;

export type ReachabilityMode = 'lan-ip' | 'hostname' | 'custom';

export type ReachabilityFieldState = {
  reachabilityMode: ReachabilityMode;
  /** Hostname/domain only for custom mode — port is always DEFAULT_APP_PUBLISH_PORT. */
  customHostname: string;
};

/** Strip scheme/path/port noise; keep a bare hostname/domain for custom mode. */
export function normalizeCustomHostname(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) {
    return '';
  }
  try {
    const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
      ? trimmed
      : `http://${trimmed}`;
    const parsed = new URL(withScheme);
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
      return '';
    }
    if (parsed.pathname !== '/' && parsed.pathname !== '') {
      return '';
    }
    return parsed.hostname.trim().toLowerCase();
  } catch {
    return '';
  }
}

export function isValidCustomHostname(value: string): boolean {
  const host = normalizeCustomHostname(value);
  if (!host) {
    return false;
  }
  // Reject empty, spaces, and bare IPs are allowed (user may type an alternate IP as name).
  return !/\s/.test(host);
}

export function isHttpOrigin(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
      return false;
    }
    return parsed.pathname === '/' || parsed.pathname === '';
  } catch {
    return false;
  }
}

export function fallbackLanBaseUrl(lanIp: string, port = DEFAULT_APP_PUBLISH_PORT): string {
  return `http://${lanIp.trim()}:${port}`;
}

export function hostnameBaseUrl(hostname: string, port = DEFAULT_APP_PUBLISH_PORT): string {
  return `http://${hostname.trim()}:${port}`;
}

/** True only when configured equals the exact hostname-mode serialization. */
export function matchesHostnameModeBase(
  configured: string | null | undefined,
  machineHostname: string | null | undefined,
  port = DEFAULT_APP_PUBLISH_PORT,
): boolean {
  const host = machineHostname?.trim();
  const base = configured?.trim();
  if (!host || !base) {
    return false;
  }
  return base === hostnameBaseUrl(host, port);
}

export function draftCanonicalBaseUrl(
  fields: ReachabilityFieldState & Pick<LanIpFieldState, 'lanAppIp' | 'customLanIp'>,
  network: Pick<NetworkSnapshot, 'machineHostname'> | null,
  port = DEFAULT_APP_PUBLISH_PORT,
): string | null {
  const lanIp = resolvedLanIp(fields);
  switch (fields.reachabilityMode) {
    case 'lan-ip':
      return lanIp ? fallbackLanBaseUrl(lanIp, port) : null;
    case 'hostname': {
      const host = network?.machineHostname?.trim();
      return host ? hostnameBaseUrl(host, port) : null;
    }
    case 'custom': {
      const host = normalizeCustomHostname(fields.customHostname);
      return host && isValidCustomHostname(host) ? hostnameBaseUrl(host, port) : null;
    }
    default:
      return null;
  }
}

export function inferReachabilityFields(status: HostStatus | null): ReachabilityFieldState {
  const configured = status?.configuredCanonicalBaseUrl?.trim() || null;
  const lanIp = status?.network.configuredLanIp?.trim() || '';
  if (!configured) {
    return { reachabilityMode: 'lan-ip', customHostname: '' };
  }

  if (lanIp && configured === fallbackLanBaseUrl(lanIp)) {
    return { reachabilityMode: 'lan-ip', customHostname: '' };
  }

  try {
    const host = new URL(configured).hostname;
    // Hostname mode is selected in UI when user picks machine hostname; stored custom
    // hostnames (including machine hostname) open as custom so the value stays editable.
    if (host && host !== lanIp) {
      return { reachabilityMode: 'custom', customHostname: host };
    }
    if (host) {
      return { reachabilityMode: 'custom', customHostname: host };
    }
  } catch {
    // fall through
  }

  return { reachabilityMode: 'custom', customHostname: configured };
}

export function effectiveCanonicalBaseUrl(status: HostStatus | null): string | null {
  if (!status) {
    return null;
  }
  return (
    status.configuredCanonicalBaseUrl?.trim() ||
    status.deviceUrls?.appBaseUrl?.trim() ||
    status.appBaseUrl?.trim() ||
    null
  );
}

/**
 * LAN/Praxisnetz probe target — never use HostStatus.appBaseUrl alone, because that
 * falls back to http://127.0.0.1:8080 when no LAN/canonical is configured.
 */
export function lanProbeBaseUrl(
  status: Pick<HostStatus, 'network' | 'deviceUrls' | 'configuredCanonicalBaseUrl'>,
  port = DEFAULT_APP_PUBLISH_PORT,
): string | undefined {
  const configured = status.configuredCanonicalBaseUrl?.trim();
  if (configured) {
    return configured;
  }
  const fromDeviceUrls = status.deviceUrls?.appBaseUrl?.trim();
  if (fromDeviceUrls) {
    return fromDeviceUrls;
  }
  const lanIp = status.network.configuredLanIp?.trim();
  return lanIp ? fallbackLanBaseUrl(lanIp, port) : undefined;
}
