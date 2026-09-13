import type {
  ComposeServiceStatus,
  ComposeStatus,
  ProxyMode,
  ProxyStatus,
} from '@praxis-flow/server-shared';
import {
  PRAXIS_FLOW_PROXY_IMAGE_COMPOSE_DEFAULT_REF,
  PRAXIS_FLOW_PROXY_IMAGE_ENV_KEY,
} from '@praxis-flow/server-shared';
import { runDockerCommand } from './docker-cli.js';
import { DEFAULT_PROXY_HTTP_PORT } from './network-bindings.js';
import {
  DEFAULT_APP_PORT,
  fallbackCanonicalBaseUrl,
  parseHttpBaseUrl,
  resolveCanonicalBaseUrlForLanPlan,
} from './urls.js';
import { isTlsPreparationInProgressEnv } from './tls-env.js';

export const DEFAULT_APP_BIND_ADDRESS = '0.0.0.0';
export const PROXY_APP_BIND_ADDRESS = '127.0.0.1';

/** Proxy mode closes the app behind host loopback; proxy-free mode stays demo-friendly. */
export function resolveAppBindAddress(proxyEnabled: boolean): string {
  return proxyEnabled ? PROXY_APP_BIND_ADDRESS : DEFAULT_APP_BIND_ADDRESS;
}

/** Always survive applySetupPlan (not part of the proxy wire payload). */
export const PROXY_IMAGE_ENV_KEY = PRAXIS_FLOW_PROXY_IMAGE_ENV_KEY;

/**
 * Survive applySetupPlan only when the wire omits `proxy` (older clients).
 * Image is always preserved separately via PROXY_IMAGE_ENV_KEY.
 */
export const PROXY_RUNTIME_ENV_KEYS = [
  'PROXY_ENABLED',
  'PROXY_MODE',
  'PROXY_HTTP_PORT',
  'APP_BIND_ADDRESS',
] as const;

export type ProxyConfig = {
  enabled: boolean;
  mode: ProxyMode;
  httpPort: number;
  appBindAddress: string;
};

export class ProxyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProxyConfigError';
  }
}

/** Abort disable cutover when `compose rm` failed — caller must not rewrite env afterward. */
export function assertComposeRemoveSucceeded(result: { ok: boolean; log: string }): void {
  if (result.ok) {
    return;
  }
  const detail = result.log.trim();
  throw new ProxyConfigError(
    detail
      ? `Proxy-Container konnte nicht entfernt werden. Die Konfiguration bleibt unverändert. ${detail}`
      : 'Proxy-Container konnte nicht entfernt werden. Die Konfiguration bleibt unverändert.',
  );
}

type EnvLike = Map<string, string> | Record<string, string | undefined> | null | undefined;

function readEnvValue(env: EnvLike, key: string): string | undefined {
  if (!env) {
    return undefined;
  }
  if (env instanceof Map) {
    return env.get(key);
  }
  return env[key];
}

const PROXY_ENABLED_TRUE = new Set(['1', 'true', 'yes', 'on']);
const PROXY_ENABLED_FALSE = new Set(['0', 'false', 'no', 'off']);

/** Strict boolean for PROXY_ENABLED — unknown tokens (e.g. "treu") are rejected. */
export function parseProxyEnabledFlag(raw: string | undefined, fallback: boolean): boolean {
  const trimmed = raw?.trim().toLowerCase() ?? '';
  if (!trimmed) {
    return fallback;
  }
  if (PROXY_ENABLED_TRUE.has(trimmed)) {
    return true;
  }
  if (PROXY_ENABLED_FALSE.has(trimmed)) {
    return false;
  }
  throw new ProxyConfigError(
    `PROXY_ENABLED=${raw?.trim()} ist ungültig (erlaubt: true/false, 1/0, yes/no, on/off)`,
  );
}

function readPortEnv(env: EnvLike, key: string, fallback: number): number {
  const parsed = Number.parseInt(readEnvValue(env, key)?.trim() || String(fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeProxyModeRaw(value: string | undefined, enabledFlag: boolean): string {
  const trimmed = value?.trim().toLowerCase() ?? '';
  if (trimmed) {
    return trimmed;
  }
  return enabledFlag ? 'http' : 'off';
}

/**
 * Allows off|http plus the two TLS cutover modes. Unknown modes, invalid PROXY_ENABLED tokens, and
 * inconsistent enabled/mode pairs are rejected — never silently rewritten.
 */
export function assertProxyEnvValid(env: EnvLike): void {
  const enabledRaw = readEnvValue(env, 'PROXY_ENABLED');
  const enabledFlag = parseProxyEnabledFlag(enabledRaw, false);
  const modeRaw = normalizeProxyModeRaw(readEnvValue(env, 'PROXY_MODE'), enabledFlag);

  if (!['off', 'http', 'tls-managed', 'tls-custom'].includes(modeRaw)) {
    throw new ProxyConfigError(
      `PROXY_MODE=${modeRaw} ist ungültig (erlaubt: off, http, tls-managed, tls-custom)`,
    );
  }

  if (enabledFlag && modeRaw === 'off') {
    throw new ProxyConfigError(
      'PROXY_ENABLED=true erfordert einen aktiven PROXY_MODE (http, tls-managed oder tls-custom)',
    );
  }

  if (!enabledFlag && modeRaw !== 'off') {
    throw new ProxyConfigError(
      `PROXY_MODE=${modeRaw} erfordert PROXY_ENABLED=true (bei deaktiviertem Proxy: PROXY_MODE=off)`,
    );
  }

  const httpPortRaw = readEnvValue(env, 'PROXY_HTTP_PORT')?.trim();
  if (httpPortRaw) {
    const parsed = Number.parseInt(httpPortRaw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
      throw new ProxyConfigError(`PROXY_HTTP_PORT ungültig: ${httpPortRaw}`);
    }
  }
}

/**
 * Normalize PROXY_ENABLED / PROXY_MODE. TLS modes retain the loopback app bind.
 * Invalid combinations throw ProxyConfigError.
 */
export function readProxyConfig(env: EnvLike): ProxyConfig {
  assertProxyEnvValid(env);

  const enabledFlag = parseProxyEnabledFlag(readEnvValue(env, 'PROXY_ENABLED'), false);
  const httpPort = readPortEnv(env, 'PROXY_HTTP_PORT', DEFAULT_PROXY_HTTP_PORT);
  const modeRaw = normalizeProxyModeRaw(readEnvValue(env, 'PROXY_MODE'), enabledFlag);
  const active = enabledFlag && modeRaw !== 'off';

  if (!active) {
    return {
      enabled: false,
      mode: 'off',
      httpPort,
      appBindAddress: resolveAppBindAddress(false),
    };
  }

  return {
    enabled: true,
    mode: modeRaw as ProxyMode,
    httpPort,
    appBindAddress: PROXY_APP_BIND_ADDRESS,
  };
}

/** HTTP origin from reachability host + proxy port (omit port when 80). */
export function buildProxyHttpCanonicalBaseUrl(host: string, httpPort: number): string {
  const trimmedHost = host.trim();
  if (!trimmedHost) {
    throw new Error('PROXY_CANONICAL_HOST_REQUIRED');
  }
  if (!Number.isFinite(httpPort) || httpPort <= 0) {
    throw new Error('PROXY_HTTP_PORT_INVALID');
  }
  const authority = httpPort === 80 ? trimmedHost : `${trimmedHost}:${httpPort}`;
  const origin = parseHttpBaseUrl(`http://${authority}`);
  if (!origin) {
    throw new Error('PROXY_CANONICAL_INVALID');
  }
  return origin;
}

/**
 * Product base for plan/apply/saveHostNetwork.
 * Proxy on → derive from reachability host + PROXY_HTTP_PORT (not from guessing proxy via URL).
 * Proxy off → existing P0 LAN/:8080 behavior.
 */
export function resolveCanonicalBaseUrlForProxyPlan(input: {
  proxy: ProxyConfig;
  existingCanonical: string | null | undefined;
  previousLanIp: string | null | undefined;
  nextLanIp: string;
  overrideCanonical?: string | null;
  tlsPreparationActive?: boolean;
}): string {
  const override = parseHttpBaseUrl(input.overrideCanonical);
  if (input.tlsPreparationActive && override) {
    const existing = parseHttpBaseUrl(input.existingCanonical);
    if (!existing || override !== existing) {
      throw new ProxyConfigError(
        'Während der HTTPS-Vorbereitung darf POST /host/network die Erreichbarkeit nicht ändern.',
      );
    }
  }
  if (input.proxy.mode === 'tls-managed' || input.proxy.mode === 'tls-custom') {
    const existing = parseHttpBaseUrl(input.existingCanonical);
    if (!existing || new URL(existing).protocol !== 'https:') {
      throw new ProxyConfigError(
        'Aktiver TLS-Proxy erfordert eine bestehende https:// CANONICAL_BASE_URL.',
      );
    }
    if (override && override !== existing) {
      throw new ProxyConfigError(
        'POST /host/network darf die Canonical-URL nach dem HTTPS-Cutover nicht ändern.',
      );
    }
    return existing;
  }
  if (!input.proxy.enabled || input.proxy.mode !== 'http') {
    if (override) {
      return override;
    }

    const existing = parseHttpBaseUrl(input.existingCanonical);
    const previousLan = input.previousLanIp?.trim();
    const nextLan = input.nextLanIp.trim();
    if (existing) {
      const url = new URL(existing);
      const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
      // Leaving proxy: restore P0 :8080 for any http origin that was not already on :8080
      // (LAN IP or custom hostname; Manager may also send an explicit override).
      if (url.protocol === 'http:' && port !== DEFAULT_APP_PORT) {
        const host =
          (previousLan && url.hostname === previousLan) || url.hostname === nextLan
            ? nextLan
            : url.hostname;
        return fallbackCanonicalBaseUrl(host, DEFAULT_APP_PORT);
      }
    }

    return resolveCanonicalBaseUrlForLanPlan({
      existingCanonical: input.existingCanonical,
      previousLanIp: input.previousLanIp,
      nextLanIp: input.nextLanIp,
      port: DEFAULT_APP_PORT,
    });
  }

  if (override) {
    return buildProxyHttpCanonicalBaseUrl(new URL(override).hostname, input.proxy.httpPort);
  }

  const existing = parseHttpBaseUrl(input.existingCanonical);
  const previousLan = input.previousLanIp?.trim();
  if (existing && previousLan) {
    const existingHost = new URL(existing).hostname;
    if (existingHost === previousLan) {
      // IP-derived (P0 :8080 or proxy form) follows the LAN plan.
      return buildProxyHttpCanonicalBaseUrl(input.nextLanIp, input.proxy.httpPort);
    }
    // Custom hostname: keep host, rebuild port from proxy config.
    return buildProxyHttpCanonicalBaseUrl(existingHost, input.proxy.httpPort);
  }

  if (existing) {
    return buildProxyHttpCanonicalBaseUrl(new URL(existing).hostname, input.proxy.httpPort);
  }

  return buildProxyHttpCanonicalBaseUrl(input.nextLanIp, input.proxy.httpPort);
}

/** Env keys written atomically with proxy on/off on apply / saveHostNetwork. */
export function buildProxyEnvUpdates(proxy: ProxyConfig, env?: EnvLike): Record<string, string> {
  if (proxy.mode === 'tls-managed' || proxy.mode === 'tls-custom') {
    return {
      PROXY_ENABLED: 'true',
      PROXY_MODE: proxy.mode,
      PROXY_HTTP_PORT: String(proxy.httpPort),
      APP_BIND_ADDRESS: PROXY_APP_BIND_ADDRESS,
    };
  }
  if (proxy.enabled && proxy.mode === 'http') {
    return {
      PROXY_ENABLED: 'true',
      PROXY_MODE: 'http',
      PROXY_HTTP_PORT: String(proxy.httpPort),
      APP_BIND_ADDRESS: PROXY_APP_BIND_ADDRESS,
    };
  }

  const hadProxyConfig =
    readEnvValue(env, 'PROXY_ENABLED') !== undefined ||
    readEnvValue(env, 'PROXY_MODE') !== undefined ||
    readEnvValue(env, 'PROXY_HTTP_PORT') !== undefined ||
    readEnvValue(env, 'APP_BIND_ADDRESS') !== undefined;

  if (!hadProxyConfig) {
    return {};
  }

  return {
    PROXY_ENABLED: 'false',
    PROXY_MODE: 'off',
    PROXY_HTTP_PORT: String(proxy.httpPort || DEFAULT_PROXY_HTTP_PORT),
    APP_BIND_ADDRESS: resolveAppBindAddress(false),
  };
}

/**
 * Resolve effective proxy config for plan/apply/network writes.
 * - override absent → read env, do not rewrite PROXY_* keys
 * - override present → apply enabled/httpPort (mode http when enabled)
 */
export function resolveProxyConfigForWrite(
  env: EnvLike,
  override?: { enabled: boolean; httpPort?: number } | null,
): { proxy: ProxyConfig; writeEnv: boolean } {
  const existing = readProxyConfig(env);
  if (override === undefined || override === null) {
    return { proxy: existing, writeEnv: false };
  }
  if (existing.mode === 'tls-managed' || existing.mode === 'tls-custom') {
    throw new ProxyConfigError(
      'POST /host/network darf einen aktiven TLS-Proxy weder ändern noch auf HTTP zurücksetzen.',
    );
  }
  if (isTlsPreparationInProgressEnv(env)) {
    if (!override.enabled || !existing.enabled) {
      throw new ProxyConfigError(
        'Während der HTTPS-Vorbereitung darf POST /host/network den Proxy nicht abschalten oder neu konfigurieren.',
      );
    }
  }

  const httpPort =
    typeof override.httpPort === 'number' &&
    Number.isFinite(override.httpPort) &&
    override.httpPort > 0
      ? override.httpPort
      : DEFAULT_PROXY_HTTP_PORT;

  if (override.enabled) {
    return {
      proxy: {
        enabled: true,
        mode: 'http',
        httpPort,
        appBindAddress: PROXY_APP_BIND_ADDRESS,
      },
      writeEnv: true,
    };
  }

  return {
    proxy: {
      enabled: false,
      mode: 'off',
      httpPort,
      appBindAddress: resolveAppBindAddress(false),
    },
    writeEnv: true,
  };
}

/**
 * Compose actions when restarting after a proxy config change.
 * Disable must remove the proxy service while the overlay is still forced in,
 * before env drops PROXY_ENABLED (otherwise the container becomes an orphan).
 */
export function planProxyComposeActions(input: {
  proxyEnabled: boolean;
  restartCompose: boolean;
  stackWasRunning: boolean;
}): { removeProxyFirst: boolean; composeUp: boolean } {
  if (!input.restartCompose || !input.stackWasRunning) {
    return { removeProxyFirst: false, composeUp: false };
  }
  if (!input.proxyEnabled) {
    return { removeProxyFirst: true, composeUp: true };
  }
  return { removeProxyFirst: false, composeUp: true };
}

export function resolveProxyImageRef(env?: EnvLike): string {
  return (
    readEnvValue(env, PROXY_IMAGE_ENV_KEY)?.trim() || PRAXIS_FLOW_PROXY_IMAGE_COMPOSE_DEFAULT_REF
  );
}

export type EnsureProxyImageResult = {
  imageRef: string;
};

/**
 * Ensure the release-supplied proxy image is present before compose up.
 * Runtime code deliberately never pulls Caddy from a registry: upgrades must arrive
 * through a digest-verified Praxis Flow release package.
 */
export async function ensureProxyImageAvailable(
  env?: EnvLike,
  deps?: {
    imageExists?: (ref: string) => Promise<boolean>;
  },
): Promise<EnsureProxyImageResult> {
  const imageRef = resolveProxyImageRef(env);
  const imageExists =
    deps?.imageExists ??
    (async (ref: string) => {
      const result = await runDockerCommand(['image', 'inspect', ref, '--format', '{{.Id}}']);
      return result.code === 0;
    });
  if (await imageExists(imageRef)) {
    return { imageRef };
  }

  throw new ProxyConfigError(
    `Proxy-Image fehlt lokal (${imageRef}). ` +
      'Ein geprüftes Praxis-Flow-Release-Paket mit Caddy importieren; ' +
      'automatische Registry-Downloads sind deaktiviert.',
  );
}

export function findProxyContainer(compose: ComposeStatus | null): ComposeServiceStatus | null {
  if (!compose) {
    return null;
  }
  return compose.services.find((service) => (service.service || service.name) === 'proxy') ?? null;
}

export function buildProxyStatus(input: {
  proxy: ProxyConfig;
  canonicalBaseUrl: string | null;
  compose: ComposeStatus | null;
}): ProxyStatus {
  return {
    enabled: input.proxy.enabled,
    mode: input.proxy.mode,
    canonicalBaseUrl: input.canonicalBaseUrl,
    httpPort: input.proxy.httpPort,
    appBindAddress: input.proxy.appBindAddress,
    container: findProxyContainer(input.compose),
  };
}
