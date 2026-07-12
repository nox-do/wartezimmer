import type { HostStatus, NetworkSnapshot } from '../shared/host-status.js';
import {
  draftCanonicalBaseUrl,
  effectiveCanonicalBaseUrl,
  type ReachabilityFieldState,
} from './reachability.js';
import { resolvedLanIp } from './wizard-state.js';

export type LanIpFieldState = {
  lanAppIp: string;
  customLanIp: string;
};

export type GatewayFieldState = {
  gatewayEnabled: boolean;
  gatewayInterface: string;
  gatewayIp: string;
  portalAppIp: string;
  authBridgeUrl: string;
};

export type { ReachabilityFieldState, ReachabilityMode } from './reachability.js';

/** Manual LAN IP is only needed when auto-detection is ambiguous or insufficient. */
export function shouldOfferManualLanIpEntry(candidateCount: number, lanIpStale: boolean): boolean {
  if (candidateCount === 0) {
    return true;
  }
  if (candidateCount > 1) {
    return true;
  }
  return lanIpStale;
}

export function hostNetworkChanged(
  fields: LanIpFieldState & GatewayFieldState & ReachabilityFieldState,
  status: HostStatus | null,
  network: Pick<NetworkSnapshot, 'machineHostname'> | null = null,
): boolean {
  if (!status) {
    return false;
  }
  const lanIp = resolvedLanIp(fields);
  const configuredLan = status.network.configuredLanIp?.trim() ?? '';
  if (lanIp && lanIp !== configuredLan) {
    return true;
  }

  const draftCanonical = draftCanonicalBaseUrl(fields, network);
  const configuredCanonical = effectiveCanonicalBaseUrl(status);
  if (draftCanonical && draftCanonical !== configuredCanonical) {
    return true;
  }

  const gateway = status.gateway;
  if (fields.gatewayEnabled !== (gateway?.enabled ?? false)) {
    return true;
  }
  if (!fields.gatewayEnabled) {
    return false;
  }
  if (fields.gatewayInterface.trim() !== (gateway?.gatewayInterface ?? 'eth1')) {
    return true;
  }
  if (fields.gatewayIp.trim() !== (gateway?.gatewayIp ?? '192.168.88.1')) {
    return true;
  }
  if (fields.authBridgeUrl.trim() !== (gateway?.authBridgeUrl ?? '').trim()) {
    return true;
  }
  const portalIp = fields.portalAppIp.trim() || lanIp;
  const configuredPortal = gateway?.portalAppIp?.trim() ?? configuredLan;
  return portalIp !== configuredPortal;
}
