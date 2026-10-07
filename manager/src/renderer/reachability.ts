import {
  deriveHttpDeviceAddress,
  persistedHttpHostname,
} from '@wartezimmer/server-shared/device-address';
import type { HostStatus } from '../shared/host-status.js';
import type { LanIpFieldState } from './host-network-panels.js';
import { resolvedLanIp } from './wizard-state.js';

export const DEFAULT_APP_PUBLISH_PORT = 8080;
export const DEFAULT_PROXY_HTTP_PORT = 80;

export type ProxyFieldState = { proxyEnabled: boolean };

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

/** HTTP origin; omit port when 80. */
export function httpOriginForHost(host: string, port: number): string {
  const trimmed = host.trim();
  if (port === 80) {
    return `http://${trimmed}`;
  }
  return `http://${trimmed}:${port}`;
}

export function fallbackLanBaseUrl(lanIp: string, port = DEFAULT_APP_PUBLISH_PORT): string {
  return httpOriginForHost(lanIp, port);
}

export function productPublishPort(proxyEnabled: boolean): number {
  return proxyEnabled ? DEFAULT_PROXY_HTTP_PORT : DEFAULT_APP_PUBLISH_PORT;
}

/** Read-only compatibility for existing HTTP names. New setups always use the selected IP. */
export function existingHttpHostname(status: HostStatus | null): string | null {
  return persistedHttpHostname(status?.configuredCanonicalBaseUrl);
}

/** Preview only; the backend derives and persists the actual address. */
export function draftCanonicalBaseUrl(
  fields: ProxyFieldState & Pick<LanIpFieldState, 'lanAppIp' | 'customLanIp'>,
  status: HostStatus | null,
): string | null {
  const lifecycle = status?.lifecycle;
  if (
    lifecycle &&
    (lifecycle.preparation !== 'none' ||
      lifecycle.mode === 'https' ||
      lifecycle.mode === 'https-portal')
  ) {
    return effectiveCanonicalBaseUrl(status);
  }
  const lanIp = resolvedLanIp(fields);
  return lanIp
    ? deriveHttpDeviceAddress({
        lanIp,
        port: productPublishPort(fields.proxyEnabled),
        existingCanonical: status?.configuredCanonicalBaseUrl,
      })
    : null;
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
  status: Pick<HostStatus, 'network' | 'deviceUrls' | 'configuredCanonicalBaseUrl'> & {
    proxy?: HostStatus['proxy'] | null;
  },
  port?: number,
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
  const effectivePort = port ?? productPublishPort(Boolean(status.proxy?.enabled));
  return lanIp ? fallbackLanBaseUrl(lanIp, effectivePort) : undefined;
}
