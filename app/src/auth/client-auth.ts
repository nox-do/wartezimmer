import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { readRequestedCookieSlotRole, type CookieSlotRole } from './cookie-slot-role.js';
import { ROUTE_ACCESS_RULES, type RouteAccessRule } from './route-access-rules.js';
import {
  createStaffSessionManager,
  getSessionCookieNameForSlot,
  getAuthSettingsSeedConfig,
  getStaffSessionAuthConfig,
  readCookieValue,
  setDeviceSessionCookie,
  setRoomPanelSessionCookie,
  type DeviceGrant,
  type DeviceSessionRole,
  type RoomPanelGrant,
  type StaffRole,
  type StaffSessionManager,
} from './session-grants.js';
import type { DeviceAuthorizationRow } from '../shared/db/database-device-authorizations.js';
import { isTrustedProxyPeer } from '../http/trusted-proxy.js';

export type ClientRole = 'terminal' | 'mfa' | 'tv' | 'captive' | 'ops' | 'room-panel';

declare module 'fastify' {
  interface FastifyRequest {
    clientRole?: ClientRole;
    deviceGrantToken?: string;
  }
}

export type DeviceGrantStore = {
  authenticateDeviceAuthorization(token: string): DeviceAuthorizationRow | null;
  touchDeviceAuthorization(authorizationId: string): DeviceAuthorizationRow | null;
};

type AuthConfig = {
  enabled: boolean;
  captiveKey: string;
  localTvOrigin: string | null;
  missingRoleKeys: ClientRole[];
};

type RegisterClientAuthOptions = {
  staffSessions?: StaffSessionManager;
  deviceGrants?: DeviceGrantStore;
};

const DEFAULT_CAPTIVE_KEYS = new Set(['change-me-captive-key']);
const MIN_PRODUCTION_CAPTIVE_KEY_LENGTH = 32;

function readOptionalBooleanEnv(name: string): boolean | undefined {
  const value = process.env[name]?.trim();
  if (!value) {
    return undefined;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  throw new Error(`${name}_INVALID`);
}

function getAuthConfig(): AuthConfig {
  const explicitAuthEnabled = readOptionalBooleanEnv('AUTH_ENABLED');
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const enabled = explicitAuthEnabled ?? nodeEnv !== 'development';
  const captiveKey = process.env.AUTH_KEY_CAPTIVE?.trim() ?? '';
  const localTvOrigin = normalizeOrigin(process.env.TV_LOCAL_ORIGIN);
  const missingRoleKeys: ClientRole[] = captiveKey.length === 0 ? ['captive'] : [];

  if (nodeEnv === 'production' && !enabled) {
    throw new Error('AUTH_DISABLED_IN_PRODUCTION');
  }

  if (
    nodeEnv === 'production' &&
    (DEFAULT_CAPTIVE_KEYS.has(captiveKey) || captiveKey.length < MIN_PRODUCTION_CAPTIVE_KEY_LENGTH)
  ) {
    throw new Error('AUTH_CAPTIVE_KEY_WEAK_IN_PRODUCTION');
  }

  if (enabled) {
    if (missingRoleKeys.length > 0) {
      throw new Error(`AUTH_MISSING_KEYS:${missingRoleKeys.join(',')}`);
    }
  }

  return { enabled, captiveKey, localTvOrigin, missingRoleKeys };
}

function normalizeOrigin(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return new URL(trimmed).origin;
  } catch {
    throw new Error('TV_LOCAL_ORIGIN_INVALID');
  }
}

function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  const match = authHeader.match(/^Bearer ([^\s]+)$/i);
  if (!match) {
    return null;
  }

  const trimmed = match[1].trim();
  return trimmed.length > 0 ? trimmed : null;
}

function safeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function resolveRoleFromToken(token: string, captiveKey: string): ClientRole | null {
  return captiveKey.length > 0 && safeEquals(token, captiveKey) ? 'captive' : null;
}

function getDefaultStaffSessionManager(): StaffSessionManager {
  const config = getStaffSessionAuthConfig(getAuthSettingsSeedConfig());
  return createStaffSessionManager({
    sessionTtlMs: config.sessionTtlMs,
    sessionIdleTtlMs: config.sessionIdleTtlMs,
  });
}

function roomPanelGrantFromRow(row: DeviceAuthorizationRow): RoomPanelGrant | null {
  if (row.role !== 'room-panel' || !row.roomId || !row.placement) {
    return null;
  }
  return {
    kind: 'room-panel',
    sessionId: row.authorizationId,
    role: 'room-panel',
    roomId: row.roomId,
    placement: row.placement,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt ?? row.createdAt,
  };
}

function deviceGrantFromRow(row: DeviceAuthorizationRow): DeviceGrant | null {
  if (row.role !== 'tv' && row.role !== 'terminal') {
    return null;
  }
  if (!row.deviceId) {
    return null;
  }
  return {
    kind: 'device',
    sessionId: row.authorizationId,
    role: row.role,
    deviceId: row.deviceId,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt ?? row.createdAt,
  };
}

function isDeviceGrantSlotRole(role: CookieSlotRole): role is DeviceSessionRole | 'room-panel' {
  return role === 'tv' || role === 'terminal' || role === 'room-panel';
}

function resolveRoleFromDeviceGrant(
  request: FastifyRequest,
  deviceGrants: DeviceGrantStore,
  requestedRole: DeviceSessionRole | 'room-panel',
): ClientRole | null {
  const token = readCookieValue(request, getSessionCookieNameForSlot(requestedRole));
  if (!token) {
    return null;
  }
  const row = deviceGrants.authenticateDeviceAuthorization(token);
  const grant =
    requestedRole === 'room-panel'
      ? row
        ? roomPanelGrantFromRow(row)
        : null
      : row
        ? deviceGrantFromRow(row)
        : null;
  if (!grant || grant.role !== requestedRole) {
    return null;
  }
  deviceGrants.touchDeviceAuthorization(grant.sessionId);
  request.authSession = grant;
  request.clientRole = grant.role;
  request.deviceGrantToken = token;
  return grant.role;
}

function resolveRoleFromStaffSessionCookie(
  request: FastifyRequest,
  staffSessions: StaffSessionManager,
  requestedRole: StaffRole,
): ClientRole | null {
  const token = readCookieValue(request, getSessionCookieNameForSlot(requestedRole));
  const session = staffSessions.getSession(token);
  if (!session || session.role !== requestedRole) {
    return null;
  }

  request.authSession = session;
  request.clientRole = session.role;
  request.staffSession = session;
  return session.role;
}

function getRouteRule(method: string, routePath: string): RouteAccessRule | undefined {
  return ROUTE_ACCESS_RULES.find((rule) => rule.method === method && rule.path === routePath);
}

function authError(
  reply: FastifyReply,
  code: number,
  payload: { code: string; message: string },
): void {
  void reply.code(code).send(payload);
}

function isUnsafeMethod(method: string): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
}

function readRequestOrigin(request: FastifyRequest): string | null {
  const originHeader =
    request.headers.origin ?? request.headers['x-client-origin'] ?? request.headers.referer;
  if (typeof originHeader !== 'string' || originHeader.length === 0) {
    return null;
  }
  try {
    return new URL(originHeader).origin;
  } catch {
    return null;
  }
}

function requestHost(request: FastifyRequest): string | null {
  const forwardedHost = request.headers['x-forwarded-host'];
  return (
    (isTrustedProxyPeer(request.raw?.socket?.remoteAddress) && typeof forwardedHost === 'string'
      ? forwardedHost
      : request.headers.host
    )
      ?.split(',')[0]
      ?.trim() ?? null
  );
}

function originHostMatchesRequest(request: FastifyRequest): boolean {
  const origin = readRequestOrigin(request);
  if (!origin) {
    return false;
  }

  const host = requestHost(request);
  if (!host) {
    return false;
  }

  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(`http://${host}`);
    if (originUrl.host === requestUrl.host) {
      return true;
    }
    return (
      process.env.NODE_ENV !== 'production' &&
      isLoopbackHostname(originUrl.hostname) &&
      isLoopbackHostname(requestUrl.hostname)
    );
  } catch {
    return false;
  }
}

function isLoopbackHostname(value: string | undefined): boolean {
  const hostname = value?.trim().toLowerCase();
  if (!hostname) {
    return false;
  }

  return hostname === 'localhost' || isLoopbackAddress(hostname);
}

function isLoopbackAddress(value: string | undefined): boolean {
  const address = value?.trim();
  if (!address) {
    return false;
  }

  return (
    address === '::1' ||
    address === '127.0.0.1' ||
    address.startsWith('127.') ||
    address === '::ffff:127.0.0.1' ||
    address.startsWith('::ffff:127.')
  );
}

function resolveLocalTvRole(
  request: FastifyRequest,
  method: string,
  rule: RouteAccessRule | undefined,
  localTvOrigin: string | null,
): ClientRole | null {
  if (!localTvOrigin || method !== 'GET' || !rule?.roles?.includes('tv')) {
    return null;
  }

  if (!isLoopbackAddress(request.ip) && !isLoopbackAddress(request.socket.remoteAddress)) {
    return null;
  }

  const origin = readRequestOrigin(request);
  if (origin !== localTvOrigin) {
    return null;
  }

  const host = requestHost(request);
  if (!host) {
    return null;
  }

  return new URL(localTvOrigin).host === host ? 'tv' : null;
}

function hasSessionCookies(request: FastifyRequest): boolean {
  const raw = request.headers.cookie;
  if (!raw?.trim()) {
    return false;
  }

  return /\bpf_(?:mfa|ops|room_panel|tv_device|terminal_device)_session=/.test(raw);
}

export function registerClientAuth(
  app: FastifyInstance,
  options: RegisterClientAuthOptions = {},
): void {
  app.decorateRequest('clientRole', undefined);
  app.decorateRequest('authSession', undefined);
  app.decorateRequest('staffSession', undefined);
  const config = getAuthConfig();
  const staffSessions = options.staffSessions ?? getDefaultStaffSessionManager();
  const deviceGrants = options.deviceGrants;

  if (!config.enabled) {
    if (config.missingRoleKeys.length > 0) {
      app.log.warn(
        { missingRoles: config.missingRoleKeys },
        'Client auth is disabled but AUTH_KEY_CAPTIVE is missing — set it before enabling AUTH_ENABLED.',
      );
    } else {
      app.log.warn('Client auth is disabled.');
    }
  }

  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const routePath = request.routeOptions.url;
    if (!routePath || !/^\/api\/v1(?:\/|$)/.test(routePath)) {
      return;
    }

    const method = request.method === 'HEAD' ? 'GET' : request.method;
    const rule = getRouteRule(method, routePath);
    if (rule?.maintenanceListenerOnly) {
      authError(reply, 404, {
        code: 'NOT_FOUND',
        message: 'Not found.',
      });
      return;
    }
    if (!rule && config.enabled) {
      app.log.warn({ method, routePath }, 'Auth rule missing for API route');
      authError(reply, 403, {
        code: 'AUTH_FORBIDDEN',
        message: 'Forbidden.',
      });
      return;
    }

    if (!config.enabled) {
      return;
    }

    const token = extractBearerToken(request.headers.authorization);
    const bearerRole = token ? resolveRoleFromToken(token, config.captiveKey) : null;
    const localTvRole = bearerRole
      ? null
      : resolveLocalTvRole(request, method, rule, config.localTvOrigin);

    let sessionRole: ClientRole | null = null;
    if (!bearerRole && !localTvRole && rule && !rule.public && hasSessionCookies(request)) {
      const requestedRole = readRequestedCookieSlotRole(request);
      if (!requestedRole) {
        authError(reply, 400, {
          code: 'INVALID_ARGUMENT',
          message: 'X-Client-Role header is required for cookie authentication.',
        });
        return;
      }
      if (isDeviceGrantSlotRole(requestedRole)) {
        if (!deviceGrants) {
          sessionRole = null;
        } else {
          sessionRole = resolveRoleFromDeviceGrant(request, deviceGrants, requestedRole);
        }
      } else {
        sessionRole = resolveRoleFromStaffSessionCookie(request, staffSessions, requestedRole);
      }
    }

    const role = bearerRole ?? localTvRole ?? sessionRole;
    if (bearerRole) {
      request.clientRole = bearerRole;
    } else if (localTvRole) {
      request.clientRole = localTvRole;
    }

    if (!rule) {
      return;
    }

    if (rule.public) {
      return;
    }

    if (!role) {
      authError(reply, 401, {
        code: 'AUTH_UNAUTHORIZED',
        message: 'Unauthorized.',
      });
      return;
    }

    if (sessionRole && isUnsafeMethod(method) && !originHostMatchesRequest(request)) {
      authError(reply, 403, {
        code: 'AUTH_FORBIDDEN',
        message: 'Forbidden.',
      });
      return;
    }

    const allowedRoles = rule.roles ?? [];
    if (!allowedRoles.includes(role)) {
      app.log.warn({ role, method, routePath }, 'Role denied for API route');
      authError(reply, 403, {
        code: 'AUTH_FORBIDDEN',
        message: 'Forbidden.',
      });
      return;
    }
  });

  app.addHook('onSend', async (request, reply, payload) => {
    const token = request.deviceGrantToken;
    const session = request.authSession;
    if (token && session?.kind === 'device' && reply.statusCode < 400) {
      try {
        setDeviceSessionCookie(reply, request, session.role, token);
      } catch {
        // Hijacked SSE already sent headers; Set-Cookie is on writeHead instead.
      }
    }
    if (token && session?.kind === 'room-panel' && reply.statusCode < 400) {
      try {
        setRoomPanelSessionCookie(reply, request, token);
      } catch {
        // Hijacked SSE already sent headers; Set-Cookie is on writeHead instead.
      }
    }
    return payload;
  });
}

export { ROUTE_ACCESS_RULES } from './route-access-rules.js';
