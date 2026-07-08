import type { GatewayPlanInput, HostStatus, NetworkSnapshot, RoutingMode } from '../shared/host-status.js';
import {
  SETUP_DEFAULT_GATEWAY_INTERFACE,
  SETUP_DEFAULT_GATEWAY_IP,
  SETUP_DEFAULT_PRACTICE_NAME,
} from '@praxis-flow/server-shared';

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
  authBridgeUrl: string;
  routingMode: RoutingMode;
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
  'gatewayEnabled' | 'gatewayInterface' | 'gatewayIp' | 'portalAppIp' | 'authBridgeUrl'
> {
  const gateway = status?.gateway;
  const resolvedLan = lanAppIp === '__custom__' ? customLanIp.trim() : lanAppIp;
  return {
    gatewayEnabled: gateway?.enabled ?? false,
    gatewayInterface: gateway?.gatewayInterface ?? SETUP_DEFAULT_GATEWAY_INTERFACE,
    gatewayIp: gateway?.gatewayIp ?? SETUP_DEFAULT_GATEWAY_IP,
    portalAppIp: gateway?.portalAppIp?.trim() || resolvedLan || '',
    authBridgeUrl: gateway?.authBridgeUrl?.trim() || '',
  };
}

export function createInitialWizardFields(status: HostStatus | null): WizardInitialFields {
  const lan = initialLanIpSelection(status);
  return {
    ...lan,
    practiceDisplayName: initialPracticeDisplayName(status),
    ...initialStorageFolderPaths(status),
    ...initialGatewayFields(status, lan.lanAppIp, lan.customLanIp),
    routingMode: 'simple',
  };
}

/** LAN + Gateway fields for maintenance (no practice/storage). */
export function createHostNetworkFields(status: HostStatus | null): Pick<
  WizardInitialFields,
  | 'lanAppIp'
  | 'customLanIp'
  | 'gatewayEnabled'
  | 'gatewayInterface'
  | 'gatewayIp'
  | 'portalAppIp'
  | 'authBridgeUrl'
> {
  const lan = initialLanIpSelection(status);
  return {
    ...lan,
    ...initialGatewayFields(status, lan.lanAppIp, lan.customLanIp),
  };
}

export function resolvedLanIp(fields: Pick<WizardInitialFields, 'lanAppIp' | 'customLanIp'>): string {
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
    | 'authBridgeUrl'
  >,
): GatewayPlanInput {
  if (!fields.gatewayEnabled) {
    return { enabled: false };
  }
  const lanAppIp = resolvedLanIp(fields);
  return {
    enabled: true,
    gatewayInterface: fields.gatewayInterface.trim() || undefined,
    gatewayIp: fields.gatewayIp.trim() || undefined,
    portalAppIp: fields.portalAppIp.trim() || lanAppIp || undefined,
    authBridgeUrl: fields.authBridgeUrl.trim() || undefined,
  };
}

export function validateGatewayAuthBridgeUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const url = new URL(trimmed);
    if ((url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname)) {
      return null;
    }
  } catch {
    // handled by common message below
  }
  return 'Bitte eine gültige Gateway-Bridge-URL mit http:// oder https:// eingeben.';
}

export function gatewayBridgeDefaultsFromNetwork(
  fields: Pick<WizardInitialFields, 'gatewayEnabled' | 'authBridgeUrl'>,
  network: NetworkSnapshot | null,
): Partial<Pick<WizardInitialFields, 'authBridgeUrl'>> {
  const defaultBridgeUrl = network?.defaultGatewayBridgeUrl?.trim();
  if (fields.gatewayEnabled && !fields.authBridgeUrl.trim() && defaultBridgeUrl) {
    return { authBridgeUrl: defaultBridgeUrl };
  }
  return {};
}
