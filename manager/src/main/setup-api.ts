import { SETUP_API_PATH_PREFIX, type SetupApiCallRequest } from '../shared/ipc-channels.js';
import {
  ManagerApiError,
  isManagerError,
  SETUP_MANAGER_TOKEN_HEADER,
  SETUP_RESTRICTED_NETWORK_ROUTES,
  SETUP_TLS_ROUTES,
} from '@wartezimmer/server-shared/setup-api';

const DEFAULT_SETUP_API_TIMEOUT_MS = 30_000;
/** Docker-Status kann auf schwachen Hosts während eines Imports länger brauchen. */
const SETUP_STATUS_TIMEOUT_MS = 40_000;
/** Erstinstallation: docker compose up --build kann deutlich länger als Status-Polls dauern. */
const FIRST_INSTALL_APPLY_TIMEOUT_MS = 10 * 60 * 1000;
/** Release-Paket importieren (docker load) kann mehrere Minuten dauern. */
const DOCKER_LOAD_TIMEOUT_MS = 15 * 60 * 1000;
/** Restore: Stack stoppen, DB, Import, Re-Export und Healthchecks — deutlich länger als Status-Polls. */
const RESTORE_TIMEOUT_MS = 10 * 60 * 1000;
/** Software-Update: Backup, docker load, Cutover, Import, Healthchecks. */
const UPDATE_APPLY_TIMEOUT_MS = 15 * 60 * 1000;
/** ACME DNS-01 plus local 443 checks (Setup retries up to 90s). */
const TLS_OBTAIN_TIMEOUT_MS = 6 * 60 * 1000;
const TLS_LOCAL_CHECK_TIMEOUT_MS = 2 * 60 * 1000;
const TLS_APPLY_TIMEOUT_MS = 3 * 60 * 1000;
const RESTRICTED_NETWORK_MUTATION_TIMEOUT_MS = 3 * 60 * 1000;

/** Transport classification uses native abort state and fetch/system cause codes. */
export function setupApiError(error: unknown, timedOut = false): ManagerApiError {
  if (error instanceof ManagerApiError) return error;
  const cause = error instanceof Error ? error.cause : undefined;
  const code =
    cause !== null && typeof cause === 'object' && 'code' in cause
      ? cause.code
      : error !== null && typeof error === 'object' && 'code' in error
        ? error.code
        : undefined;
  if (
    timedOut ||
    (error instanceof DOMException && error.name === 'TimeoutError') ||
    code === 'ETIMEDOUT' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    code === 'UND_ERR_HEADERS_TIMEOUT' ||
    code === 'UND_ERR_BODY_TIMEOUT'
  ) {
    return new ManagerApiError(
      {
        code: 'setup_api_timeout',
        category: 'timeout',
        retryable: false,
        message:
          'Die Setup-API hat nicht rechtzeitig geantwortet. Bitte zuerst den Operationsstatus prüfen.',
      },
      { cause: error },
    );
  }
  if (
    [
      'ECONNREFUSED',
      'ECONNRESET',
      'ENOTFOUND',
      'EAI_AGAIN',
      'EHOSTUNREACH',
      'ENETUNREACH',
      'EPIPE',
      'UND_ERR_SOCKET',
    ].includes(String(code))
  ) {
    return new ManagerApiError(
      {
        code: 'setup_api_unavailable',
        category: 'unavailable',
        retryable: true,
        message: 'Die lokale Setup-API ist vorübergehend nicht erreichbar.',
      },
      { cause: error },
    );
  }
  return new ManagerApiError(
    {
      code: 'setup_api_internal_error',
      category: 'internal',
      retryable: false,
      message: 'Die Aktion konnte wegen eines internen Fehlers nicht abgeschlossen werden.',
    },
    { cause: error },
  );
}

function isSetupApplyBody(
  body: unknown,
): body is { runCompose?: boolean; preserveEnv?: boolean; composeBuild?: boolean } {
  return body !== null && typeof body === 'object';
}

export function setupApiTimeoutMs(request: SetupApiCallRequest): number {
  if (request.method === 'GET' && request.path.split('?')[0] === '/api/setup/host/status') {
    return SETUP_STATUS_TIMEOUT_MS;
  }
  if (request.method === 'POST' && request.path === '/api/setup/host/rebuild') return 5 * 60 * 1000;
  if (request.method === 'POST' && request.path === '/api/setup/host/installation/start') {
    return 3 * 60 * 1000;
  }
  if (request.method === 'POST' && request.path === '/api/setup/host/images/load') {
    return DOCKER_LOAD_TIMEOUT_MS;
  }
  if (
    request.method === 'POST' &&
    (request.path === '/api/setup/host/install/prepare' ||
      request.path === '/api/setup/host/install/commit')
  ) {
    return DOCKER_LOAD_TIMEOUT_MS;
  }

  if (
    request.method === 'POST' &&
    (request.path === '/api/setup/host/backup/restore' ||
      request.path === '/api/setup/host/install/finish')
  ) {
    return RESTORE_TIMEOUT_MS;
  }

  if (request.method === 'POST' && request.path === '/api/setup/host/update/apply') {
    return UPDATE_APPLY_TIMEOUT_MS;
  }

  if (request.method === 'POST' && request.path === SETUP_TLS_ROUTES.obtainCertificate) {
    return TLS_OBTAIN_TIMEOUT_MS;
  }

  if (
    request.method === 'POST' &&
    (request.path === SETUP_TLS_ROUTES.checkCertificate || request.path === SETUP_TLS_ROUTES.renew)
  ) {
    return TLS_LOCAL_CHECK_TIMEOUT_MS;
  }

  if (request.method === 'POST' && request.path === SETUP_TLS_ROUTES.apply) {
    return TLS_APPLY_TIMEOUT_MS;
  }

  if (
    request.method === 'POST' &&
    (request.path === SETUP_RESTRICTED_NETWORK_ROUTES.apply ||
      request.path === SETUP_RESTRICTED_NETWORK_ROUTES.remove)
  ) {
    return RESTRICTED_NETWORK_MUTATION_TIMEOUT_MS;
  }

  if (request.method !== 'POST' || request.path !== '/api/setup/host/apply') {
    return DEFAULT_SETUP_API_TIMEOUT_MS;
  }

  if (!isSetupApplyBody(request.body) || !request.body.runCompose) {
    return DEFAULT_SETUP_API_TIMEOUT_MS;
  }

  const likelyBuild = request.body.composeBuild !== false && !request.body.preserveEnv;
  return likelyBuild ? FIRST_INSTALL_APPLY_TIMEOUT_MS : DEFAULT_SETUP_API_TIMEOUT_MS;
}

export function resolveSetupApiUrl(apiBase: string, requestPath: string): URL {
  const baseUrl = new URL(apiBase);
  const url = new URL(requestPath, baseUrl);

  if (url.origin !== baseUrl.origin) {
    throw new Error('Setup-API nur auf dem konfigurierten Ursprung erlaubt');
  }
  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
    throw new Error('Setup-API nur auf localhost erlaubt');
  }
  // URL resolves dot segments (including percent-encoded ones). Check the
  // normalized pathname so an allowed-looking input cannot escape /host/.
  if (!url.pathname.startsWith(SETUP_API_PATH_PREFIX)) {
    throw new Error(`Setup-API-Pfad nicht erlaubt: ${requestPath}`);
  }

  return url;
}

export async function callSetupApi<T = unknown>(
  apiBase: string,
  request: SetupApiCallRequest,
  token?: string | null,
): Promise<T> {
  const signal = AbortSignal.timeout(setupApiTimeoutMs(request));
  try {
    const url = resolveSetupApiUrl(apiBase, request.path);
    const headers: Record<string, string> = {};
    const init: RequestInit = { method: request.method, signal };
    if (request.method !== 'GET') {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(request.body ?? {});
    }
    if (token) headers[SETUP_MANAGER_TOKEN_HEADER] = token;
    init.headers = headers;

    const response = await fetch(url, init);
    const text = await response.text();
    const body: unknown = text.trim() ? JSON.parse(text) : null;
    if (!response.ok) {
      if (
        body !== null &&
        typeof body === 'object' &&
        'error' in body &&
        isManagerError(body.error)
      ) {
        throw new ManagerApiError(body.error);
      }
      throw new Error(`Invalid Setup-API error response (HTTP ${response.status})`);
    }
    return body as T;
  } catch (error) {
    throw setupApiError(error, signal.aborted);
  }
}
