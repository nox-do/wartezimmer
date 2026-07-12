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

function coerceSetupRecord(body: unknown): Record<string, unknown> {
  return body !== null && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

function coerceSetupPlanInput(body: unknown): SetupPlanInput {
  return coerceSetupRecord(body) as SetupPlanInput;
}

function coerceApplySetupInput(body: unknown): ApplySetupInput {
  return coerceSetupRecord(body) as ApplySetupInput;
}

function coerceHostNetworkInput(body: unknown): HostNetworkInput {
  return coerceSetupRecord(body) as HostNetworkInput;
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

export function normalizeSetupPlanInput(body: unknown): NormalizedSetupPlanInput {
  const input = coerceSetupPlanInput(body);
  const lanAppIp = requireTrimmedLanAppIp(input.lanAppIp);
  return {
    lanAppIp,
    practiceDisplayName: input.practiceDisplayName?.trim() || SETUP_DEFAULT_PRACTICE_NAME,
    portalAppIp: input.gateway?.portalAppIp?.trim() || undefined,
    canonicalBaseUrl: normalizeOptionalCanonicalBaseUrl(input.canonicalBaseUrl),
    gateway: normalizeGatewayPlan(input.gateway, lanAppIp),
  };
}

export function normalizeApplySetupInput(body: unknown): NormalizedSetupPlanInput & {
  runCompose?: boolean;
  preserveEnv?: boolean;
  delivery?: boolean;
  composeBuild?: boolean;
  runProbes?: boolean;
} {
  const input = coerceApplySetupInput(body);
  return {
    ...normalizeSetupPlanInput(input),
    folders: normalizeStorageFolderPaths(input.folders),
    delivery: input.delivery,
    runCompose: input.runCompose,
    preserveEnv: input.preserveEnv,
    composeBuild: input.composeBuild,
    runProbes: input.runProbes,
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

export function normalizeHostNetworkInput(body: unknown): {
  lanAppIp: string;
  gateway: GatewayPlan;
  restartCompose: boolean;
  canonicalBaseUrl?: string;
} {
  const input = coerceHostNetworkInput(body);
  const lanAppIp = requireTrimmedLanAppIp(input.lanAppIp);
  return {
    lanAppIp,
    restartCompose: Boolean(input.restartCompose),
    gateway: normalizeGatewayPlan(requireHostNetworkGateway(input.gateway), lanAppIp),
    canonicalBaseUrl: normalizeOptionalCanonicalBaseUrl(input.canonicalBaseUrl),
  };
}
