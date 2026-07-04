import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ROUTE_ACCESS_RULES, type RouteAccessRule } from './route-access-rules.js';
import {
  createStaffSessionManager,
  getDeviceSessionCookieName,
  getRoomPanelSessionCookieName,
  getAuthSettingsSeedConfig,
  getStaffSessionAuthConfig,
  getStaffSessionCookieName,
  readCookieValue,
  type StaffSessionManager,
} from './staff-session-auth.js';
import { trustProxyHeaders } from '../http/trusted-proxy.js';

export type ClientRole = 'terminal' | 'mfa' | 'tv' | 'captive' | 'ops' | 'room-panel';

declare module 'fastify' {
  interface FastifyRequest {
    clientRole?: ClientRole;
  }
}

type AuthConfig = {
  enabled: boolean;
  captiveKey: string;
  localTvOrigin: string | null;
  missingRoleKeys: ClientRole[];
  productionAuthDisabled: boolean;
};

type RegisterClientAuthOptions = {
  staffSessions?: StaffSessionManager;
};

const DEFAULT_CAPTIVE_KEYS = new Set(['change-me-captive-key']);
const MIN_PRODUCTION_CAPTIVE_KEY_LENGTH = 32;

function getAuthConfig(): AuthConfig {
  const explicitAuthEnabled = process.env.AUTH_ENABLED?.trim();
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const enabled = explicitAuthEnabled ? explicitAuthEnabled === 'true' : nodeEnv !== 'development';
  const productionAuthDisabled = nodeEnv === 'production' && explicitAuthEnabled === 'false';
  const captiveKey = process.env.AUTH_KEY_CAPTIVE?.trim() ?? '';
  const localTvOrigin = normalizeOrigin(process.env.TV_LOCAL_ORIGIN);
  const missingRoleKeys: ClientRole[] = captiveKey.length === 0 ? ['captive'] : [];

  if (productionAuthDisabled) {
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

  return { enabled, captiveKey, localTvOrigin, missingRoleKeys, productionAuthDisabled };
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

function resolveRoleFromSessionCookie(
  request: FastifyRequest,
  staffSessions: StaffSessionManager,
): ClientRole | null {
  const staffToken = readCookieValue(request, getStaffSessionCookieName());
  const requestedDeviceRole = readRequestedDeviceRole(request);
  const deviceToken =
    requestedDeviceRole === 'terminal' || requestedDeviceRole === 'tv'
      ? readCookieValue(request, getDeviceSessionCookieName(requestedDeviceRole))
      : requestedDeviceRole
        ? null
        : readAnyDeviceSessionCookie(request);
  const roomPanelToken =
    requestedDeviceRole === 'room-panel'
      ? readCookieValue(request, getRoomPanelSessionCookieName())
      : requestedDeviceRole
        ? null
        : readCookieValue(request, getRoomPanelSessionCookieName());
  const deviceSession = staffSessions.getSession(deviceToken);
  const roomPanelSession = staffSessions.getSession(roomPanelToken);
  if (
    requestedDeviceRole &&
    deviceSession?.kind === 'device' &&
    deviceSession.role === requestedDeviceRole
  ) {
    request.authSession = deviceSession;
    request.clientRole = deviceSession.role;
    return deviceSession.role;
  }
  if (requestedDeviceRole) {
    if (
      requestedDeviceRole === 'room-panel' &&
      roomPanelSession?.kind === 'room-panel' &&
      roomPanelSession.role === requestedDeviceRole
    ) {
      request.authSession = roomPanelSession;
      request.clientRole = roomPanelSession.role;
      return roomPanelSession.role;
    }
    return null;
  }

  const session = staffSessions.getSession(staffToken) ?? deviceSession ?? roomPanelSession;
  if (!session) {
    return null;
  }

  request.authSession = session;
  request.clientRole = session.role;
  if (session.kind === 'staff') {
    request.staffSession = session;
  }

  return session.role;
}

function readAnyDeviceSessionCookie(request: FastifyRequest): string | null {
  return (
    readCookieValue(request, getDeviceSessionCookieName('terminal')) ??
    readCookieValue(request, getDeviceSessionCookieName('tv'))
  );
}

function readRequestedDeviceRole(
  request: FastifyRequest,
): Extract<ClientRole, 'terminal' | 'tv' | 'room-panel'> | null {
  const header = request.headers['x-client-role'];
  const value = typeof header === 'string' ? header.trim().toLowerCase() : '';
  return value === 'terminal' || value === 'tv' || value === 'room-panel' ? value : null;
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
    (trustProxyHeaders() && typeof forwardedHost === 'string'
      ? forwardedHost
      : request.headers.host)
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

export function registerClientAuth(
  app: FastifyInstance,
  options: RegisterClientAuthOptions = {},
): void {
  app.decorateRequest('clientRole', undefined);
  app.decorateRequest('authSession', undefined);
  app.decorateRequest('staffSession', undefined);
  const config = getAuthConfig();
  const staffSessions = options.staffSessions ?? getDefaultStaffSessionManager();

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
    if (!rule && config.enabled) {
      app.log.warn({ method, routePath }, 'Auth rule missing for API route');
      authError(reply, 403, {
        code: 'AUTH_FORBIDDEN',
        message: 'Forbidden.',
      });
      return;
    }

    const token = extractBearerToken(request.headers.authorization);
    const bearerRole = token ? resolveRoleFromToken(token, config.captiveKey) : null;
    const sessionRole = bearerRole ? null : resolveRoleFromSessionCookie(request, staffSessions);
    const localTvRole =
      bearerRole || sessionRole
        ? null
        : resolveLocalTvRole(request, method, rule, config.localTvOrigin);
    const role = bearerRole ?? sessionRole ?? localTvRole;
    if (bearerRole) {
      request.clientRole = bearerRole;
    } else if (localTvRole) {
      request.clientRole = localTvRole;
    }

    if (!config.enabled) {
      return;
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
}

export { ROUTE_ACCESS_RULES } from './route-access-rules.js';
