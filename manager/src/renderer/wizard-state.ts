import type {
  GatewayPlanInput,
  HostStatus,
  NetworkSnapshot,
  RoutingMode,
} from '../shared/host-status.js';
import {
  buildGatewayBridgeUrl,
  parseGatewayManagementIpFromBridgeUrl,
  validateGatewayManagementIp,
} from '@praxis-flow/server-shared';
import {
  SETUP_DEFAULT_GATEWAY_INTERFACE,
  SETUP_DEFAULT_GATEWAY_IP,
  SETUP_DEFAULT_PRACTICE_NAME,
} from '@praxis-flow/server-shared/setup-api';
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
  gatewayEnabled: boolean;
  gatewayInterface: string;
  gatewayIp: string;
  portalAppIp: string;
  gatewayManagementIp: string;
  reachabilityMode: ReachabilityMode;
  customHostname: string;
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

export function initialGatewayFields(
  status: HostStatus | null,
  lanAppIp: string,
  customLanIp: string,
): Pick<
  WizardInitialFields,
  'gatewayEnabled' | 'gatewayInterface' | 'gatewayIp' | 'portalAppIp' | 'gatewayManagementIp'
> {
  const gateway = status?.gateway;
  const resolvedLan = lanAppIp === '__custom__' ? customLanIp.trim() : lanAppIp;
  return {
    gatewayEnabled: gateway?.enabled ?? false,
    gatewayInterface: gateway?.gatewayInterface ?? SETUP_DEFAULT_GATEWAY_INTERFACE,
    gatewayIp: gateway?.gatewayIp ?? SETUP_DEFAULT_GATEWAY_IP,
    portalAppIp: gateway?.portalAppIp?.trim() || resolvedLan || '',
    gatewayManagementIp:
      parseGatewayManagementIpFromBridgeUrl(gateway?.authBridgeUrl) ?? '',
  };
}

type GatewayDefaultFields = Pick<
  WizardInitialFields,
  'gatewayEnabled' | 'portalAppIp' | 'gatewayManagementIp'
>;

export function gatewayDraftDefaults(
  fields: GatewayDefaultFields,
  _network: NetworkSnapshot | null,
  lanIpFallback = '',
): Partial<Pick<WizardInitialFields, 'portalAppIp'>> {
  if (!fields.gatewayEnabled) {
    return {};
  }

  const patch: Partial<Pick<WizardInitialFields, 'portalAppIp'>> = {};
  const fallbackPortalIp = lanIpFallback.trim();

  if (!fields.portalAppIp.trim() && fallbackPortalIp) {
    patch.portalAppIp = fallbackPortalIp;
  }

  return patch;
}

export function gatewayEnabledPatch(
  fields: GatewayDefaultFields,
  enabled: boolean,
  network: NetworkSnapshot | null,
  lanIpFallback = '',
): Pick<WizardInitialFields, 'gatewayEnabled'> &
  Partial<Pick<WizardInitialFields, 'portalAppIp'>> {
  const base = { ...fields, gatewayEnabled: enabled };
  return {
    gatewayEnabled: enabled,
    ...gatewayDraftDefaults(base, network, lanIpFallback),
  };
}

export function createInitialWizardFields(status: HostStatus | null): WizardInitialFields {
  const lan = initialLanIpSelection(status);
  return {
    ...lan,
    practiceDisplayName: initialPracticeDisplayName(status),
    ...initialStorageFolderPaths(status),
    ...initialGatewayFields(status, lan.lanAppIp, lan.customLanIp),
    ...inferReachabilityFields(status),
    routingMode: null,
  };
}

/** LAN + Gateway + reachability fields for maintenance (no practice/storage). */
export function createHostNetworkFields(
  status: HostStatus | null,
): Pick<
  WizardInitialFields,
  | 'lanAppIp'
  | 'customLanIp'
  | 'gatewayEnabled'
  | 'gatewayInterface'
  | 'gatewayIp'
  | 'portalAppIp'
  | 'gatewayManagementIp'
> &
  ReachabilityFieldState {
  const lan = initialLanIpSelection(status);
  return {
    ...lan,
    ...initialGatewayFields(status, lan.lanAppIp, lan.customLanIp),
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

export function buildGatewayPlanInput(
  fields: Pick<
    WizardInitialFields,
    | 'lanAppIp'
    | 'customLanIp'
    | 'gatewayEnabled'
    | 'gatewayInterface'
    | 'gatewayIp'
    | 'portalAppIp'
    | 'gatewayManagementIp'
  >,
): GatewayPlanInput {
  if (!fields.gatewayEnabled) {
    return { enabled: false };
  }
  const lanAppIp = resolvedLanIp(fields);
  const managementIp = fields.gatewayManagementIp.trim();
  return {
    enabled: true,
    gatewayInterface: fields.gatewayInterface.trim() || undefined,
    gatewayIp: fields.gatewayIp.trim() || undefined,
    portalAppIp: fields.portalAppIp.trim() || lanAppIp || undefined,
    authBridgeUrl: buildGatewayBridgeUrl(managementIp),
  };
}

export function validateGatewayManagementIpForUi(
  managementIp: string,
  fields: Pick<WizardInitialFields, 'gatewayInterface' | 'gatewayIp'>,
  network: NetworkSnapshot | null,
): string | null {
  return validateGatewayManagementIp(managementIp, {
    gatewayInterface: fields.gatewayInterface,
    gatewayIp: fields.gatewayIp,
    interfaces: network?.interfaces,
  });
}
