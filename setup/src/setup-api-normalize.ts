import type {
  ApplySetupInput,
  GatewayPlan,
  GatewayPlanInput,
  HostNetworkInput,
  NormalizedSetupPlanInput,
  SetupPlanInput,
  StorageFolderPaths,
} from '@praxis-flow/server-shared';
import {
  SETUP_DEFAULT_GATEWAY_INTERFACE,
  SETUP_DEFAULT_GATEWAY_IP,
  SETUP_DEFAULT_PRACTICE_NAME,
} from '@praxis-flow/server-shared';
import { parseHttpBaseUrl } from './urls.js';

export class SetupApiValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SetupApiValidationError';
  }
}

export function requireTrimmedLanAppIp(value: string | undefined): string {
  const lanAppIp = value?.trim();
  if (!lanAppIp) {
    throw new SetupApiValidationError('lanAppIp required');
  }
  return lanAppIp;
}

function normalizeGatewayAuthBridgeUrl(value: string | undefined): string {
  const authBridgeUrl = value?.trim() ?? '';
  if (!authBridgeUrl) {
    return '';
  }
  try {
    const url = new URL(authBridgeUrl);
    if ((url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname)) {
      return authBridgeUrl;
    }
  } catch {
    // handled by common validation error below
  }
  throw new SetupApiValidationError(
    'authBridgeUrl muss eine gültige URL mit http:// oder https:// sein',
  );
}

export function normalizeGatewayPlan(
  input: GatewayPlanInput | undefined,
  lanAppIp: string,
): GatewayPlan {
  return {
    enabled: Boolean(input?.enabled),
    gatewayInterface: input?.gatewayInterface?.trim() || SETUP_DEFAULT_GATEWAY_INTERFACE,
    gatewayIp: input?.gatewayIp?.trim() || SETUP_DEFAULT_GATEWAY_IP,
    portalAppIp: input?.portalAppIp?.trim() || lanAppIp,
    authBridgeUrl: input?.enabled ? normalizeGatewayAuthBridgeUrl(input.authBridgeUrl) : '',
  };
}

function requireHostNetworkGateway(input: GatewayPlanInput | undefined): GatewayPlanInput {
  if (!input) {
    throw new SetupApiValidationError('gateway required');
  }
  return input;
}

export function normalizeStorageFolderPaths(
  folders: { imports?: string; exports?: string } | undefined,
): StorageFolderPaths | undefined {
  const imports = folders?.imports?.trim();
  const exports = folders?.exports?.trim();
  if (!imports || !exports) {
    return undefined;
  }
  return { imports, exports };
}

export function normalizeSetupPlanInput(body: SetupPlanInput): NormalizedSetupPlanInput {
  const lanAppIp = requireTrimmedLanAppIp(body.lanAppIp);
  return {
    lanAppIp,
    practiceDisplayName: body.practiceDisplayName?.trim() || SETUP_DEFAULT_PRACTICE_NAME,
    portalAppIp: body.gateway?.portalAppIp?.trim() || undefined,
    canonicalBaseUrl: normalizeOptionalCanonicalBaseUrl(body.canonicalBaseUrl),
    gateway: normalizeGatewayPlan(body.gateway, lanAppIp),
  };
}

export function normalizeApplySetupInput(
  body: ApplySetupInput,
): NormalizedSetupPlanInput & {
  runCompose?: boolean;
  preserveEnv?: boolean;
  delivery?: boolean;
  composeBuild?: boolean;
  runProbes?: boolean;
} {
  return {
    ...normalizeSetupPlanInput(body),
    folders: normalizeStorageFolderPaths(body.folders),
    delivery: body.delivery,
    runCompose: body.runCompose,
    preserveEnv: body.preserveEnv,
    composeBuild: body.composeBuild,
    runProbes: body.runProbes,
  };
}

function normalizeOptionalCanonicalBaseUrl(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = parseHttpBaseUrl(trimmed);
  if (!parsed) {
    throw new SetupApiValidationError(
      'canonicalBaseUrl muss eine http(s)-Origin sein (ohne Pfad/Query), z. B. http://192.168.1.10:8080',
    );
  }
  return parsed;
}

export function normalizeHostNetworkInput(body: HostNetworkInput): {
  lanAppIp: string;
  gateway: GatewayPlan;
  restartCompose: boolean;
  canonicalBaseUrl?: string;
} {
  const lanAppIp = requireTrimmedLanAppIp(body.lanAppIp);
  return {
    lanAppIp,
    restartCompose: Boolean(body.restartCompose),
    gateway: normalizeGatewayPlan(requireHostNetworkGateway(body.gateway), lanAppIp),
    canonicalBaseUrl: normalizeOptionalCanonicalBaseUrl(body.canonicalBaseUrl),
  };
}
