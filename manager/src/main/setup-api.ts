import type { HostStatus } from '../shared/host-status.js';
import { SETUP_API_PATH_PREFIX, type SetupApiCallRequest } from '../shared/ipc-channels.js';

const DEFAULT_SETUP_API_TIMEOUT_MS = 30_000;
/** Erstinstallation: docker compose up --build kann deutlich länger als Status-Polls dauern. */
const FIRST_INSTALL_APPLY_TIMEOUT_MS = 10 * 60 * 1000;
/** Release-Paket importieren (docker load) kann mehrere Minuten dauern. */
const DOCKER_LOAD_TIMEOUT_MS = 15 * 60 * 1000;

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

function setupApiTimeoutMs(request: SetupApiCallRequest): number {
  if (request.method === 'POST' && request.path === '/api/setup/host/images/load') {
    return DOCKER_LOAD_TIMEOUT_MS;
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

export async function fetchHostStatusFromApi(apiBase: string): Promise<HostStatus> {
  return callSetupApi<HostStatus>(apiBase, {
    method: 'GET',
    path: '/api/setup/host/status',
  });
}

export async function callSetupApi<T = unknown>(
  apiBase: string,
  request: SetupApiCallRequest,
): Promise<T> {
  if (!request.path.startsWith(SETUP_API_PATH_PREFIX)) {
    throw new Error(`Setup-API-Pfad nicht erlaubt: ${request.path}`);
  }

  const url = new URL(request.path, apiBase);
  const hostname = url.hostname;
  if (hostname !== '127.0.0.1' && hostname !== 'localhost') {
    throw new Error('Setup-API nur auf localhost erlaubt');
  }

  const init: RequestInit = {
    method: request.method,
    signal: AbortSignal.timeout(setupApiTimeoutMs(request)),
  };
  if (request.method === 'POST') {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(request.body ?? {});
  }

  const response = await fetch(url, init);
  const text = await response.text();
  let body: unknown = null;
  if (text.trim()) {
    body = JSON.parse(text) as unknown;
  }

  if (!response.ok) {
    const detail = errorDetailFromBody(body) ?? `HTTP ${response.status}`;
    throw new Error(`Setup-API ${request.path}: ${detail}`);
  }

  return body as T;
}
