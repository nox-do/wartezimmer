import type {
  ComposeServiceStatus,
  ComposeStatus,
  ProxyMode,
  ProxyStatus,
} from '@praxis-flow/server-shared';
import { DEFAULT_PROXY_HTTP_PORT } from './network-bindings.js';
import {
  DEFAULT_APP_PORT,
  fallbackCanonicalBaseUrl,
  parseHttpBaseUrl,
  resolveCanonicalBaseUrlForLanPlan,
} from './urls.js';

export const DEFAULT_APP_BIND_ADDRESS = '0.0.0.0';
export const PROXY_APP_BIND_ADDRESS = '127.0.0.1';

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

function readBooleanEnv(env: EnvLike, key: string, fallback: boolean): boolean {
  const raw = readEnvValue(env, key)?.trim().toLowerCase();
  if (!raw) {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(raw);
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
 * P2a allows only off|http. Unknown modes (incl. future TLS) and inconsistent
 * PROXY_ENABLED=true + PROXY_MODE=off are rejected — never silently rewritten.
 */
export function assertProxyEnvValid(env: EnvLike): void {
  const enabledFlag = readBooleanEnv(env, 'PROXY_ENABLED', false);
  const modeRaw = normalizeProxyModeRaw(readEnvValue(env, 'PROXY_MODE'), enabledFlag);

  if (modeRaw !== 'off' && modeRaw !== 'http') {
    throw new ProxyConfigError(
      `PROXY_MODE=${modeRaw} wird in diesem Stand nicht unterstützt (erlaubt: off, http)`,
    );
  }

  if (enabledFlag && modeRaw === 'off') {
    throw new ProxyConfigError(
      'PROXY_ENABLED=true erfordert PROXY_MODE=http (PROXY_MODE=off ist ungültig)',
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
 * Normalize PROXY_ENABLED / PROXY_MODE for P2a (off | http only).
 * Invalid combinations throw ProxyConfigError.
 */
export function readProxyConfig(env: EnvLike): ProxyConfig {
  assertProxyEnvValid(env);

  const enabledFlag = readBooleanEnv(env, 'PROXY_ENABLED', false);
  const httpPort = readPortEnv(env, 'PROXY_HTTP_PORT', DEFAULT_PROXY_HTTP_PORT);
  const modeRaw = normalizeProxyModeRaw(readEnvValue(env, 'PROXY_MODE'), enabledFlag);
  const httpActive = enabledFlag && modeRaw === 'http';

  if (!httpActive) {
    return {
      enabled: false,
      mode: 'off',
      httpPort,
      appBindAddress: DEFAULT_APP_BIND_ADDRESS,
    };
  }

  return {
    enabled: true,
    mode: 'http',
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
}): string {
  const override = parseHttpBaseUrl(input.overrideCanonical);
  if (!input.proxy.enabled || input.proxy.mode !== 'http') {
    if (override) {
      return override;
    }

    const existing = parseHttpBaseUrl(input.existingCanonical);
    const previousLan = input.previousLanIp?.trim();
    const nextLan = input.nextLanIp.trim();
    if (existing) {
      const url = new URL(existing);
      const host = url.hostname;
      const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
      // Leaving proxy: restore P0 :8080 for IP-derived proxy URLs (port 80 or custom proxy port).
      if (
        url.protocol === 'http:' &&
        (host === previousLan || host === nextLan) &&
        port !== DEFAULT_APP_PORT
      ) {
        return fallbackCanonicalBaseUrl(nextLan, DEFAULT_APP_PORT);
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
    APP_BIND_ADDRESS: DEFAULT_APP_BIND_ADDRESS,
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

export function findProxyContainer(compose: ComposeStatus | null): ComposeServiceStatus | null {
  if (!compose) {
    return null;
  }
  return (
    compose.services.find((service) => (service.service || service.name) === 'proxy') ?? null
  );
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
