import type { HostStatus, RoutingMode } from '../shared/host-status.js';
import { SETUP_DEFAULT_PRACTICE_NAME } from '@praxis-flow/server-shared/setup-api';
import {
  inferReachabilityFields,
  type ReachabilityFieldState,
  type ReachabilityMode,
} from './reachability.js';

export type WizardInitialFields = {
  lanAppIp: string;
  customLanIp: string;
  practiceDisplayName: string;
  importsHostPath: string;
  exportsHostPath: string;
  reachabilityMode: ReachabilityMode;
  customHostname: string;
  proxyEnabled: boolean;
  /** null until getRoutingMode() hydrates — never show a fake default. */
  routingMode: RoutingMode | null;
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

export function initialPracticeDisplayName(status: HostStatus | null): string {
  const configured = status?.practiceDisplayName?.trim();
  if (configured) {
    return configured;
  }
  if (status?.envExists) {
    return '';
  }
  return SETUP_DEFAULT_PRACTICE_NAME;
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
    practiceDisplayName: initialPracticeDisplayName(status),
    ...initialStorageFolderPaths(status),
    ...inferReachabilityFields(status),
    routingMode: null,
  };
}

/** LAN + reachability fields for maintenance (no practice/storage). */
export function createHostNetworkFields(
  status: HostStatus | null,
): Pick<WizardInitialFields, 'lanAppIp' | 'customLanIp'> & ReachabilityFieldState {
  const lan = initialLanIpSelection(status);
  return {
    ...lan,
    ...inferReachabilityFields(status),
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
