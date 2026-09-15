import type { HostStatus } from '../shared/host-status.js';
import {
  draftCanonicalBaseUrl,
  effectiveCanonicalBaseUrl,
  type ProxyFieldState,
} from './reachability.js';
import { resolvedLanIp } from './wizard-state.js';

export type LanIpFieldState = {
  lanAppIp: string;
  customLanIp: string;
};

export type HostNetworkDraftFields = LanIpFieldState & ProxyFieldState;

export type { ProxyFieldState } from './reachability.js';

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

export function snapshotNetworkDraft(draft: HostNetworkDraftFields): HostNetworkDraftFields {
  return {
    lanAppIp: draft.lanAppIp,
    customLanIp: draft.customLanIp,
    proxyEnabled: draft.proxyEnabled,
  };
}

export function networkDraftEquals(a: HostNetworkDraftFields, b: HostNetworkDraftFields): boolean {
  return (
    a.lanAppIp === b.lanAppIp &&
    a.customLanIp === b.customLanIp &&
    a.proxyEnabled === b.proxyEnabled
  );
}

/**
 * Pure draft-field drift vs saved config (LAN / canonical / proxy).
 * Does not include leftover gateway — that is apply-needed, not draft edit.
 */
export function networkDraftChanged(
  fields: HostNetworkDraftFields,
  status: HostStatus | null,
): boolean {
  if (!status) {
    return false;
  }
  const lanIp = resolvedLanIp(fields);
  const configuredLan = status.network.configuredLanIp?.trim() ?? '';
  if (lanIp && lanIp !== configuredLan) {
    return true;
  }

  // Once TLS starts, reachability/proxy identity is owned by the TLS controller.
  // This draft may still save LAN-IP changes, but must not manufacture an HTTP diff.
  if (status.tls && (status.tls.state !== 'off' || status.tls.cutoverApplied)) {
    return false;
  }

  const draftCanonical = draftCanonicalBaseUrl(fields, status);
  const configuredCanonical = effectiveCanonicalBaseUrl(status);
  if (draftCanonical && draftCanonical !== configuredCanonical) {
    return true;
  }

  if (fields.proxyEnabled !== Boolean(status.proxy?.enabled)) {
    return true;
  }

  return false;
}

/**
 * Apply button: draft fields differ OR leftover GATEWAY_* still needs a save to clear.
 */
export function hostNetworkChanged(
  fields: HostNetworkDraftFields,
  status: HostStatus | null,
): boolean {
  if (networkDraftChanged(fields, status)) {
    return true;
  }
  // Leftover openNDS GATEWAY_* from older installs — cleared on next network save.
  if (status?.gateway?.enabled) {
    return true;
  }
  return false;
}
