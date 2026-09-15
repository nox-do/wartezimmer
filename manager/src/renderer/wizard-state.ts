import type { HostStatus } from '../shared/host-status.js';
import type { ProxyFieldState } from './reachability.js';

export type WizardInitialFields = {
  lanAppIp: string;
  customLanIp: string;
  importsHostPath: string;
  exportsHostPath: string;
  proxyEnabled: boolean;
};

export function initialStorageFolderPaths(status: HostStatus | null): {
  importsHostPath: string;
  exportsHostPath: string;
} {
  if (status?.folders) {
    return {
      importsHostPath: status.folders.imports,
      exportsHostPath: status.folders.exports,
    };
  }
  return { importsHostPath: '', exportsHostPath: '' };
}

export function initialLanIpSelection(
  status: HostStatus | null,
): Pick<WizardInitialFields, 'lanAppIp' | 'customLanIp'> {
  const configured = status?.network.configuredLanIp?.trim() ?? '';
  const candidates = status?.network.currentLanCandidates ?? [];
  const candidateAddresses = new Set(candidates.map((candidate) => candidate.address));

  if (configured && candidateAddresses.has(configured)) {
    return { lanAppIp: configured, customLanIp: '' };
  }

  const first = candidates[0]?.address;
  if (first) {
    // Stale/missing .env IP: prefer a live host candidate over keeping the old value.
    return { lanAppIp: first, customLanIp: '' };
  }

  if (configured) {
    return { lanAppIp: '__custom__', customLanIp: configured };
  }

  return { lanAppIp: '__custom__', customLanIp: '' };
}

export function createInitialWizardFields(status: HostStatus | null): WizardInitialFields {
  const lan = initialLanIpSelection(status);
  return {
    ...lan,
    ...initialStorageFolderPaths(status),
    proxyEnabled: Boolean(status?.proxy?.enabled),
  };
}

/** LAN + reachability fields for maintenance (no practice/storage). */
export function createHostNetworkFields(
  status: HostStatus | null,
): Pick<WizardInitialFields, 'lanAppIp' | 'customLanIp'> & ProxyFieldState {
  const lan = initialLanIpSelection(status);
  return {
    ...lan,
    proxyEnabled: Boolean(status?.proxy?.enabled),
  };
}

export function resolvedLanIp(
  fields: Pick<WizardInitialFields, 'lanAppIp' | 'customLanIp'>,
): string {
  if (fields.lanAppIp === '__custom__') {
    return fields.customLanIp.trim();
  }
  return fields.lanAppIp;
}
