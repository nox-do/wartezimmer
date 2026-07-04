import type { DeviceUrls, GatewayPlan } from '@praxis-flow/server-shared';

export type { DeviceUrls, GatewayPlan } from '@praxis-flow/server-shared';

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

export function buildDeviceUrls(lanAppIp: string, port = 8080): DeviceUrls {
  const appBaseUrl = `http://${lanAppIp}:${port}`;
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
  bridgeUrl: string,
): Record<string, string> {
  if (!gateway.enabled) {
    return {};
  }

  const portalBase =
    gateway.portalAppIp.trim().length > 0
      ? `http://${gateway.portalAppIp.trim()}:8080`
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
    GATEWAY_AUTH_BRIDGE_URL: gateway.authBridgeUrl.trim() || bridgeUrl,
    GATEWAY_AUTH_BRIDGE_PORT: '9100',
    GATEWAY_AUTH_BRIDGE_BIND: '0.0.0.0',
  };
}
