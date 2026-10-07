import type { DeviceUrls, GatewayPlan } from '@wartezimmer/server-shared';
import { deriveGatewayBridgeBindFromUrl } from '@wartezimmer/server-shared';

export type { DeviceUrls, GatewayPlan } from '@wartezimmer/server-shared';

export const DEFAULT_APP_PORT = 8080;

/** Local Docker-publish probe target — not a user/device URL. */
export const LOCAL_SETUP_APP_BASE_URL = `http://127.0.0.1:${DEFAULT_APP_PORT}`;

export const DEFAULT_MAINTENANCE_PORT = 8082;

/** Manager maintenance API — host loopback via Docker publish; not LAN-reachable. */
export const LOCAL_MAINTENANCE_APP_BASE_URL = `http://127.0.0.1:${DEFAULT_MAINTENANCE_PORT}`;

/** Keys written by `buildGatewayEnv` — removed from `.env` when gateway is disabled. */
export const GATEWAY_ENV_KEYS = [
  'GATEWAY_INTERFACE',
  'GATEWAY_IP',
  'GATEWAY_DHCP_RANGE_START',
  'GATEWAY_DHCP_RANGE_END',
  'APP_PORTAL_URL',
  'APP_API_URL',
  'APP_PORTAL_MENU_URL',
  'PORTAL_FQDN',
  'GATEWAY_AUTH_BRIDGE_URL',
  'GATEWAY_AUTH_BRIDGE_PORT',
  'GATEWAY_AUTH_BRIDGE_BIND',
] as const;

type EnvLike = Map<string, string> | Record<string, string | undefined> | null | undefined;

function readEnvValue(env: EnvLike, key: string): string | undefined {
  if (!env) {
    return undefined;
  }
  if (env instanceof Map) {
    return env.get(key);
  }
  return env[key];
}

/** Strip trailing slashes so path joins stay stable. */
export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

/**
 * Accept only an http(s) origin as product base:
 * protocol + host + optional port. No path, query, hash, or userinfo.
 * Trailing slash is allowed and stripped.
 */
export function parseHttpBaseUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    if (parsed.username || parsed.password) {
      return null;
    }
    if (parsed.search || parsed.hash) {
      return null;
    }
    // Allow only empty path or a single trailing slash (origin form).
    if (parsed.pathname !== '/' && parsed.pathname !== '') {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function fallbackCanonicalBaseUrl(lanAppIp: string, port = DEFAULT_APP_PORT): string {
  return `http://${lanAppIp.trim()}:${port}`;
}

/**
 * Product URL authority for humans/devices (Terminal, TV, MFA, Ops, Portal).
 * Prefers CANONICAL_BASE_URL; falls back to http://<lan-ip>:8080.
 * Returns null when neither is available.
 */
export function resolveCanonicalBaseUrl(
  env: EnvLike,
  configuredLanIp: string | null | undefined,
  port = DEFAULT_APP_PORT,
): string | null {
  const configured = parseHttpBaseUrl(readEnvValue(env, 'CANONICAL_BASE_URL'));
  if (configured) {
    return configured;
  }

  const lanIp = configuredLanIp?.trim();
  if (!lanIp) {
    return null;
  }
  return fallbackCanonicalBaseUrl(lanIp, port);
}

export function buildDeviceUrlsFromBaseUrl(baseUrl: string): DeviceUrls {
  const appBaseUrl = normalizeBaseUrl(baseUrl);
  return {
    appBaseUrl,
    terminal: `${appBaseUrl}/terminal`,
    mfa: `${appBaseUrl}/mfa`,
    tv: `${appBaseUrl}/tv`,
    ops: `${appBaseUrl}/ops`,
    opsSetup: `${appBaseUrl}/ops/setup`,
    portal: `${appBaseUrl}/portal`,
  };
}

export function buildGatewayEnv(
  gateway: GatewayPlan,
  deviceUrls: DeviceUrls,
): Record<string, string> {
  if (!gateway.enabled) {
    return {};
  }

  const bridgeUrl = gateway.authBridgeUrl.trim();
  if (!bridgeUrl) {
    throw new Error('GATEWAY_AUTH_BRIDGE_URL required when gateway is enabled');
  }

  const portalBase =
    gateway.portalAppIp.trim().length > 0
      ? `http://${gateway.portalAppIp.trim()}:${DEFAULT_APP_PORT}`
      : deviceUrls.appBaseUrl;

  return {
    GATEWAY_INTERFACE: gateway.gatewayInterface,
    GATEWAY_IP: gateway.gatewayIp,
    GATEWAY_DHCP_RANGE_START: '192.168.88.50',
    GATEWAY_DHCP_RANGE_END: '192.168.88.250',
    APP_PORTAL_URL: `${portalBase}/portal`,
    APP_API_URL: portalBase,
    APP_PORTAL_MENU_URL: `${portalBase}/portal/menu`,
    PORTAL_FQDN: 'portal.praxis.local',
    GATEWAY_AUTH_BRIDGE_URL: bridgeUrl,
    GATEWAY_AUTH_BRIDGE_PORT: '9100',
    GATEWAY_AUTH_BRIDGE_BIND: deriveGatewayBridgeBindFromUrl(bridgeUrl),
  };
}
