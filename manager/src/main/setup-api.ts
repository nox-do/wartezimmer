import { SETUP_API_PATH_PREFIX, type SetupApiCallRequest } from '../shared/ipc-channels.js';
import {
  SETUP_MANAGER_TOKEN_HEADER,
  SETUP_RESTRICTED_NETWORK_ROUTES,
  SETUP_TLS_ROUTES,
} from '@praxis-flow/server-shared/setup-api';

const DEFAULT_SETUP_API_TIMEOUT_MS = 30_000;
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

const IPC_ERROR_PREFIX = /^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/;
const SETUP_API_ERROR_PREFIX = /^Setup-API\s+\/api\/setup\/host\/[^:]+:\s*/;
const TECHNICAL_ERROR_PATTERN =
  /(?:Client network socket|ECONN[A-Z]*|EADDRINUSE|fetch failed|Container\s|docker compose|node:[a-z]|\bat\s+file:|\bat\s+\S+\s+\([^)]*:\d+:\d+\))/i;

function setupActionFallback(path: string): string {
  if (path.startsWith('/api/setup/host/restricted-network/')) {
    return 'Der Patientenzugang konnte nicht geändert werden. Bitte prüfen Sie die Voraussetzungen und versuchen Sie es erneut.';
  }
  if (path.startsWith('/api/setup/host/tls/')) {
    return 'Die HTTPS-Einstellung konnte nicht geändert werden. Bitte prüfen Sie die Voraussetzungen und versuchen Sie es erneut.';
  }
  return 'Die Aktion konnte nicht abgeschlossen werden. Bitte versuchen Sie es erneut.';
}

/** Detailed process output stays in the main-process log, never in the renderer. */
export function setupApiUserErrorMessage(
  error: unknown,
  request: Pick<SetupApiCallRequest, 'path'>,
): string {
  const raw = (error instanceof Error ? error.message : String(error))
    .replace(IPC_ERROR_PREFIX, '')
    .replace(SETUP_API_ERROR_PREFIX, '')
    .trim();

  if (/setup token required|maintenance token required/i.test(raw)) {
    return 'Der Manager konnte sich nicht an der lokalen Setup-API anmelden. Bitte Manager und Praxis Flow mit demselben Installationsstand neu starten.';
  }

  if (raw.includes('Listener-Prüfung fehlgeschlagen')) {
    const restored = raw.includes('wiederhergestellt');
    return [
      'Der Portalzugang war nach dem Start nicht über die gewählte Netzwerkadresse erreichbar.',
      restored
        ? 'Die Aktivierung wurde zurückgenommen; der Staff-Zugang bleibt unverändert.'
        : 'Die Aktivierung konnte nicht sicher abgeschlossen werden.',
      'Bitte prüfen Sie die Netzwerkadresse und versuchen Sie es erneut.',
    ].join(' ');
  }

  const withoutRollbackLog = raw.split(/\nRollback:/, 1)[0]?.trim() ?? '';
  if (!withoutRollbackLog || TECHNICAL_ERROR_PATTERN.test(withoutRollbackLog)) {
    return setupActionFallback(request.path);
  }
  return withoutRollbackLog;
}

function isStructuredOperationResult(body: unknown): body is { ok: boolean } {
  return (
    body !== null && typeof body === 'object' && typeof (body as { ok?: unknown }).ok === 'boolean'
  );
}

function returnsStructuredOperationResult(path: string): boolean {
  return path === '/api/setup/host/backup/restore' || path === '/api/setup/host/update/apply';
}

function isSetupApplyBody(
  body: unknown,
): body is { runCompose?: boolean; preserveEnv?: boolean; composeBuild?: boolean } {
  return body !== null && typeof body === 'object';
}

function errorDetailFromBody(body: unknown): string | null {
  if (body === null || typeof body !== 'object' || !('error' in body)) {
    return null;
  }
  return String(body.error);
}

export function setupApiTimeoutMs(request: SetupApiCallRequest): number {
  if (request.method === 'POST' && request.path === '/api/setup/host/images/load') {
    return DOCKER_LOAD_TIMEOUT_MS;
  }

  if (request.method === 'POST' && request.path === '/api/setup/host/backup/restore') {
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
  const url = resolveSetupApiUrl(apiBase, request.path);

  const init: RequestInit = {
    method: request.method,
    signal: AbortSignal.timeout(setupApiTimeoutMs(request)),
  };
  const headers: Record<string, string> = {};
  if (request.method === 'POST') {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(request.body ?? {});
  }
  if (token) {
    headers[SETUP_MANAGER_TOKEN_HEADER] = token;
  }
  if (Object.keys(headers).length > 0) {
    init.headers = headers;
  }

  const response = await fetch(url, init);
  const text = await response.text();
  let body: unknown = null;
  if (text.trim()) {
    body = JSON.parse(text) as unknown;
  }

  if (!response.ok) {
    if (returnsStructuredOperationResult(request.path) && isStructuredOperationResult(body)) {
      return body as T;
    }
    const detail = errorDetailFromBody(body) ?? `HTTP ${response.status}`;
    throw new Error(`Setup-API ${request.path}: ${detail}`);
  }

  return body as T;
}
