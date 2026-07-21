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
  fields: LanIpFieldState & ReachabilityFieldState,
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

  if (fields.proxyEnabled !== Boolean(status.proxy?.enabled)) {
    return true;
  }

  // Leftover openNDS GATEWAY_* from older installs — cleared on next network save.
  if (status.gateway?.enabled) {
    return true;
  }

  return false;
}
