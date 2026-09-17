import type {
  ApplySetupInput,
  GatewayPlan,
  GatewayPlanInput,
  HostNetworkInput,
  NormalizedSetupPlanInput,
  ProxyConfigInput,
  RestrictedNetworkPrepareInput,
  SetupPlanInput,
  StorageFolderPaths,
  TlsCustomCertificateInput,
  TlsPrepareInput,
  TlsRenewInput,
} from '@praxis-flow/server-shared';
import {
  SETUP_DEFAULT_GATEWAY_INTERFACE,
  SETUP_DEFAULT_GATEWAY_IP,
  parseGatewayManagementIpFromBridgeUrl,
  validateGatewayManagementIp,
} from '@praxis-flow/server-shared';
import { DEFAULT_PROXY_HTTP_PORT } from './network-bindings.js';

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

function requireBodyString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new SetupApiValidationError(`${key} required`);
  }
  return value.trim();
}

export function normalizeTlsPrepareInput(body: unknown): TlsPrepareInput {
  const record = coerceSetupRecord(body);
  const mode = record.mode;
  if (mode !== 'managed' && mode !== 'custom') {
    throw new SetupApiValidationError('mode must be managed or custom');
  }
  const hostname =
    typeof record.hostname === 'string' && record.hostname.trim()
      ? record.hostname.trim()
      : undefined;
  if (mode === 'custom' && !hostname) {
    throw new SetupApiValidationError('hostname required for custom TLS');
  }
  return {
    mode,
    lanIp: requireBodyString(record, 'lanIp'),
    ...(hostname ? { hostname } : {}),
  };
}

export function normalizeRestrictedNetworkPrepareInput(
  body: unknown,
): RestrictedNetworkPrepareInput {
  const record = coerceSetupRecord(body);
  if (typeof record.warningsConfirmed !== 'boolean') {
    throw new SetupApiValidationError('warningsConfirmed must be boolean');
  }
  return {
    hostIp: requireBodyString(record, 'hostIp'),
    interfaceId: requireBodyString(record, 'interfaceId'),
    warningsConfirmed: record.warningsConfirmed,
  };
}

export function normalizeTlsCustomCertificateInput(body: unknown): TlsCustomCertificateInput {
  const record = coerceSetupRecord(body);
  return {
    fullchainPem: requireBodyString(record, 'fullchainPem'),
    privateKeyPem: requireBodyString(record, 'privateKeyPem'),
  };
}

export function normalizeTlsRenewInput(body: unknown): TlsRenewInput {
  const record = coerceSetupRecord(body);
  const fullchainPem =
    typeof record.fullchainPem === 'string' && record.fullchainPem.trim()
      ? record.fullchainPem.trim()
      : undefined;
  const privateKeyPem =
    typeof record.privateKeyPem === 'string' && record.privateKeyPem.trim()
      ? record.privateKeyPem.trim()
      : undefined;
  if (Boolean(fullchainPem) !== Boolean(privateKeyPem)) {
    throw new SetupApiValidationError(
      'fullchainPem und privateKeyPem müssen gemeinsam angegeben werden',
    );
  }
  return { ...(fullchainPem ? { fullchainPem, privateKeyPem } : {}) };
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
  const enabled = Boolean(input?.enabled);
  const gatewayInterface = input?.gatewayInterface?.trim() || SETUP_DEFAULT_GATEWAY_INTERFACE;
  const gatewayIp = input?.gatewayIp?.trim() || SETUP_DEFAULT_GATEWAY_IP;
  const portalAppIp = input?.portalAppIp?.trim() || lanAppIp;
  const authBridgeUrl = enabled ? normalizeGatewayAuthBridgeUrl(input?.authBridgeUrl) : '';

  if (enabled && !authBridgeUrl) {
    throw new SetupApiValidationError(
      'authBridgeUrl ist erforderlich, wenn das Gast-WLAN vorbereitet wird',
    );
  }

  if (enabled) {
    const managementIp = parseGatewayManagementIpFromBridgeUrl(authBridgeUrl);
    if (!managementIp) {
      throw new SetupApiValidationError(
        'authBridgeUrl muss eine gültige URL mit Host/IP sein (z. B. http://192.168.10.25:9100)',
      );
    }
    const validationError = validateGatewayManagementIp(managementIp, {
      gatewayInterface,
      gatewayIp,
    });
    if (validationError) {
      throw new SetupApiValidationError(validationError);
    }
  }

  return {
    enabled,
    gatewayInterface,
    gatewayIp,
    portalAppIp,
    authBridgeUrl,
  };
}

function requireHostNetworkGateway(input: GatewayPlanInput | undefined): GatewayPlanInput {
  if (!input) {
    throw new SetupApiValidationError('gateway required');
  }
  return input;
}

/** Absent wire field → undefined (leave env alone). Present → validated ProxyConfigInput. */
export function normalizeOptionalProxyConfig(
  input: ProxyConfigInput | undefined,
): ProxyConfigInput | undefined {
  if (input === undefined) {
    return undefined;
  }
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new SetupApiValidationError('proxy muss ein Objekt mit enabled sein');
  }
  if (typeof input.enabled !== 'boolean') {
    throw new SetupApiValidationError('proxy.enabled muss boolean sein');
  }

  let httpPort = DEFAULT_PROXY_HTTP_PORT;
  if (input.httpPort !== undefined) {
    if (
      typeof input.httpPort !== 'number' ||
      !Number.isFinite(input.httpPort) ||
      input.httpPort <= 0 ||
      input.httpPort > 65535 ||
      !Number.isInteger(input.httpPort)
    ) {
      throw new SetupApiValidationError(
        'proxy.httpPort muss eine ganze Zahl zwischen 1 und 65535 sein',
      );
    }
    httpPort = input.httpPort;
  }

  return {
    enabled: input.enabled,
    httpPort,
  };
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
  const proxy = normalizeOptionalProxyConfig(input.proxy);
  rejectCanonicalOverride(body);
  return {
    lanAppIp,
    practiceDisplayName: input.practiceDisplayName?.trim() || '',
    portalAppIp: input.gateway?.portalAppIp?.trim() || undefined,
    gateway: normalizeGatewayPlan(input.gateway, lanAppIp),
    ...(proxy ? { proxy } : {}),
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

function rejectCanonicalOverride(body: unknown): void {
  if (body && typeof body === 'object' && 'canonicalBaseUrl' in body) {
    throw new SetupApiValidationError(
      'canonicalBaseUrl wird nicht mehr unterstützt. Die HTTP-Adresse wird aus IP und Proxy-Modus gebildet; HTTPS-Adressen werden über die HTTPS-Einrichtung verwaltet.',
    );
  }
}

export function normalizeHostNetworkInput(body: unknown): {
  lanAppIp: string;
  gateway: GatewayPlan;
  restartCompose: boolean;
  repairProxy: boolean;
  proxy?: ProxyConfigInput;
} {
  const input = coerceHostNetworkInput(body);
  const lanAppIp = requireTrimmedLanAppIp(input.lanAppIp);
  const proxy = normalizeOptionalProxyConfig(input.proxy);
  rejectCanonicalOverride(body);
  const repairProxy = Boolean(input.repairProxy);
  return {
    lanAppIp,
    restartCompose: Boolean(input.restartCompose) || repairProxy,
    repairProxy,
    gateway: normalizeGatewayPlan(requireHostNetworkGateway(input.gateway), lanAppIp),
    ...(proxy ? { proxy } : {}),
  };
}
