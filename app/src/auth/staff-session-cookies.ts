import type { FastifyReply, FastifyRequest } from 'fastify';
import type { CookieSlotRole } from './cookie-slot-role.js';
import type { DeviceSessionRole, StaffRole } from './session-grant-types.js';
import { trustProxyHeaders } from '../http/trusted-proxy.js';

const STAFF_SESSION_COOKIE_BY_ROLE: Record<StaffRole, string> = {
  mfa: 'pf_mfa_session',
  ops: 'pf_ops_session',
};
const DEVICE_SESSION_COOKIE_BY_ROLE: Record<DeviceSessionRole, string> = {
  terminal: 'pf_terminal_device_session',
  tv: 'pf_tv_device_session',
};
const ROOM_PANEL_SESSION_COOKIE = 'pf_room_panel_session';

export const DEVICE_AUTHORIZATION_COOKIE_TTL_MS = 365 * 24 * 60 * 60 * 1000;

function tokenCookieOptions(request: FastifyRequest, maxAgeSeconds: number): string {
  const forwardedProto = request.headers['x-forwarded-proto'];
  const isHttps =
    request.protocol === 'https' ||
    (trustProxyHeaders() &&
      typeof forwardedProto === 'string' &&
      forwardedProto.split(',')[0]?.trim() === 'https');
  const secure = isHttps ? '; Secure' : '';
  return `Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Strict${secure}`;
}

function expiredCookieOptions(request: FastifyRequest): string {
  return `${tokenCookieOptions(request, 0)}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

function appendSetCookie(reply: FastifyReply, cookie: string): void {
  const existing = reply.getHeader('Set-Cookie');
  if (!existing) {
    reply.header('Set-Cookie', cookie);
    return;
  }

  if (Array.isArray(existing)) {
    reply.header('Set-Cookie', [...existing, cookie]);
    return;
  }

  reply.header('Set-Cookie', [existing as string, cookie]);
}

export function getStaffSessionCookieName(role: StaffRole): string {
  return STAFF_SESSION_COOKIE_BY_ROLE[role];
}

export function getDeviceSessionCookieName(role: DeviceSessionRole): string {
  return DEVICE_SESSION_COOKIE_BY_ROLE[role];
}

export function getRoomPanelSessionCookieName(): string {
  return ROOM_PANEL_SESSION_COOKIE;
}

export function getSessionCookieNameForSlot(role: CookieSlotRole): string {
  if (role === 'room-panel') {
    return ROOM_PANEL_SESSION_COOKIE;
  }
  if (role === 'mfa' || role === 'ops') {
    return getStaffSessionCookieName(role);
  }
  return getDeviceSessionCookieName(role);
}

export function readCookieValue(request: FastifyRequest, cookieName: string): string | null {
  const raw = request.headers.cookie;
  if (!raw) {
    return null;
  }

  for (const part of raw.split(';')) {
    const [name, ...valueParts] = part.trim().split('=');
    if (name === cookieName) {
      const value = valueParts.join('=').trim();
      return value ? decodeURIComponent(value) : null;
    }
  }

  return null;
}

export function readSessionTokenForSlot(
  request: FastifyRequest,
  role: CookieSlotRole,
): string | null {
  return readCookieValue(request, getSessionCookieNameForSlot(role));
}

export function setStaffSessionCookie(
  reply: FastifyReply,
  request: FastifyRequest,
  role: StaffRole,
  token: string,
  ttlMs: number,
): void {
  const maxAgeSeconds = Math.floor(ttlMs / 1000);
  const cookieName = getStaffSessionCookieName(role);
  appendSetCookie(
    reply,
    `${cookieName}=${encodeURIComponent(token)}; ${tokenCookieOptions(request, maxAgeSeconds)}`,
  );
}

export function formatDeviceSessionCookie(
  request: FastifyRequest,
  role: DeviceSessionRole,
  token: string,
  ttlMs: number = DEVICE_AUTHORIZATION_COOKIE_TTL_MS,
): string {
  const maxAgeSeconds = Math.floor(ttlMs / 1000);
  return `${getDeviceSessionCookieName(role)}=${encodeURIComponent(token)}; ${tokenCookieOptions(request, maxAgeSeconds)}`;
}

export function setDeviceSessionCookie(
  reply: FastifyReply,
  request: FastifyRequest,
  role: DeviceSessionRole,
  token: string,
  ttlMs: number = DEVICE_AUTHORIZATION_COOKIE_TTL_MS,
): void {
  appendSetCookie(reply, formatDeviceSessionCookie(request, role, token, ttlMs));
}

export function setRoomPanelSessionCookie(
  reply: FastifyReply,
  request: FastifyRequest,
  token: string,
  ttlMs: number = DEVICE_AUTHORIZATION_COOKIE_TTL_MS,
): void {
  appendSetCookie(reply, formatRoomPanelSessionCookie(request, token, ttlMs));
}

export function formatRoomPanelSessionCookie(
  request: FastifyRequest,
  token: string,
  ttlMs: number = DEVICE_AUTHORIZATION_COOKIE_TTL_MS,
): string {
  const maxAgeSeconds = Math.floor(ttlMs / 1000);
  return `${ROOM_PANEL_SESSION_COOKIE}=${encodeURIComponent(token)}; ${tokenCookieOptions(request, maxAgeSeconds)}`;
}

export function withDeviceGrantSetCookie(
  request: FastifyRequest,
  headers: Record<string, string>,
): Record<string, string> {
  const token = request.deviceGrantToken;
  const session = request.authSession;
  if (token && session?.kind === 'device') {
    return {
      ...headers,
      'Set-Cookie': formatDeviceSessionCookie(request, session.role, token),
    };
  }
  if (token && session?.kind === 'room-panel') {
    return {
      ...headers,
      'Set-Cookie': formatRoomPanelSessionCookie(request, token),
    };
  }
  return headers;
}

export function clearStaffSessionCookie(
  reply: FastifyReply,
  request: FastifyRequest,
  role: StaffRole,
): void {
  appendSetCookie(reply, `${getStaffSessionCookieName(role)}=; ${expiredCookieOptions(request)}`);
}

export function clearDeviceSessionCookie(
  reply: FastifyReply,
  request: FastifyRequest,
  role: DeviceSessionRole,
): void {
  appendSetCookie(reply, `${getDeviceSessionCookieName(role)}=; ${expiredCookieOptions(request)}`);
}

export function clearRoomPanelSessionCookie(reply: FastifyReply, request: FastifyRequest): void {
  appendSetCookie(reply, `${ROOM_PANEL_SESSION_COOKIE}=; ${expiredCookieOptions(request)}`);
}

export function clearSessionCookieForSlot(
  reply: FastifyReply,
  request: FastifyRequest,
  role: CookieSlotRole,
): void {
  if (role === 'mfa' || role === 'ops') {
    clearStaffSessionCookie(reply, request, role);
    return;
  }
  if (role === 'room-panel') {
    clearRoomPanelSessionCookie(reply, request);
    return;
  }
  clearDeviceSessionCookie(reply, request, role);
}
