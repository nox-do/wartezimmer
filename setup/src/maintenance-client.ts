import {
  MAINTENANCE_API_INFO_PATH,
  parseMaintenanceApiInfo,
  type MaintenanceApiInfo,
} from '@praxis-flow/server-shared';
import { maintenanceRequestHeaders } from './maintenance-auth.js';
import { LOCAL_MAINTENANCE_APP_BASE_URL } from './urls.js';

export type MaintenanceClientFailure =
  | 'unauthorized'
  | 'unreachable'
  | 'http-error'
  | 'invalid-response';

export class MaintenanceClientError extends Error {
  constructor(
    readonly kind: MaintenanceClientFailure,
    message: string,
    readonly statusCode?: number,
    readonly responseBody?: Record<string, unknown>,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'MaintenanceClientError';
  }
}

export type MaintenanceRequestOptions = {
  method?: 'GET' | 'POST';
  body?: unknown;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export async function requestMaintenanceJson(
  path: string,
  localMaintenanceAppBaseUrl = LOCAL_MAINTENANCE_APP_BASE_URL,
  options: MaintenanceRequestOptions = {},
): Promise<Record<string, unknown>> {
  let headers: Record<string, string>;
  try {
    headers = maintenanceRequestHeaders(
      options.body === undefined ? {} : { 'content-type': 'application/json' },
    );
  } catch (error) {
    throw new MaintenanceClientError(
      'unauthorized',
      error instanceof Error ? error.message : 'Maintenance-Token fehlt.',
      undefined,
      undefined,
      { cause: error },
    );
  }

  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(
      `${localMaintenanceAppBaseUrl.replace(/\/$/, '')}${path}`,
      {
        method: options.method ?? 'GET',
        headers,
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
      },
    );
  } catch (error) {
    throw new MaintenanceClientError(
      'unreachable',
      'Wartezimmer Maintenance-API ist nicht erreichbar.',
      undefined,
      undefined,
      { cause: error },
    );
  }

  const decoded: unknown = await response.json().catch(() => null);
  const body =
    decoded !== null && typeof decoded === 'object' && !Array.isArray(decoded)
      ? (decoded as Record<string, unknown>)
      : null;
  if (!response.ok) {
    const kind = response.status === 401 || response.status === 403 ? 'unauthorized' : 'http-error';
    throw new MaintenanceClientError(
      kind,
      typeof body?.message === 'string'
        ? body.message
        : `Maintenance-API antwortete mit HTTP ${response.status}.`,
      response.status,
      body ?? undefined,
    );
  }
  if (!body) {
    throw new MaintenanceClientError(
      'invalid-response',
      'Maintenance-API lieferte keine gültige JSON-Antwort.',
    );
  }
  return body;
}

export async function fetchMaintenanceApiInfo(
  localMaintenanceAppBaseUrl = LOCAL_MAINTENANCE_APP_BASE_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<MaintenanceApiInfo> {
  const body = await requestMaintenanceJson(MAINTENANCE_API_INFO_PATH, localMaintenanceAppBaseUrl, {
    timeoutMs: 5_000,
    fetchImpl,
  });
  const info = parseMaintenanceApiInfo(body);
  if (!info) {
    throw new MaintenanceClientError(
      'invalid-response',
      'Maintenance-API lieferte einen ungültigen Handshake.',
    );
  }
  return info;
}
