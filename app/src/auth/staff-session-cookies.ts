import type { FastifyReply, FastifyRequest } from 'fastify';
import type { DeviceSessionRole } from './staff-session-types.js';
import { trustProxyHeaders } from '../http/trusted-proxy.js';

const STAFF_SESSION_COOKIE = 'pf_staff_session';
const DEVICE_SESSION_COOKIE_BY_ROLE: Record<DeviceSessionRole, string> = {
  terminal: 'pf_terminal_device_session',
  tv: 'pf_tv_device_session',
};
const ROOM_PANEL_SESSION_COOKIE = 'pf_room_panel_session';

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

export function getStaffSessionCookieName(): string {
  return STAFF_SESSION_COOKIE;
}

export function getDeviceSessionCookieName(role: DeviceSessionRole): string {
  return DEVICE_SESSION_COOKIE_BY_ROLE[role];
}

export function getRoomPanelSessionCookieName(): string {
  return ROOM_PANEL_SESSION_COOKIE;
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

export function setStaffSessionCookie(
  reply: FastifyReply,
  request: FastifyRequest,
  token: string,
  ttlMs: number,
): void {
  const maxAgeSeconds = Math.floor(ttlMs / 1000);
  reply.header(
    'Set-Cookie',
    `${STAFF_SESSION_COOKIE}=${encodeURIComponent(token)}; ${tokenCookieOptions(request, maxAgeSeconds)}`,
  );
}

export function setDeviceSessionCookie(
  reply: FastifyReply,
  request: FastifyRequest,
  role: DeviceSessionRole,
  token: string,
  ttlMs: number,
): void {
  const maxAgeSeconds = Math.floor(ttlMs / 1000);
  reply.header(
    'Set-Cookie',
    `${getDeviceSessionCookieName(role)}=${encodeURIComponent(token)}; ${tokenCookieOptions(request, maxAgeSeconds)}`,
  );
}

export function setRoomPanelSessionCookie(
  reply: FastifyReply,
  request: FastifyRequest,
  token: string,
  ttlMs: number,
): void {
  const maxAgeSeconds = Math.floor(ttlMs / 1000);
  reply.header(
    'Set-Cookie',
    `${ROOM_PANEL_SESSION_COOKIE}=${encodeURIComponent(token)}; ${tokenCookieOptions(request, maxAgeSeconds)}`,
  );
}

export function clearStaffSessionCookie(reply: FastifyReply, request: FastifyRequest): void {
  reply.header('Set-Cookie', `${STAFF_SESSION_COOKIE}=; ${expiredCookieOptions(request)}`);
}

export function clearRoomPanelSessionCookie(reply: FastifyReply, request: FastifyRequest): void {
  reply.header('Set-Cookie', `${ROOM_PANEL_SESSION_COOKIE}=; ${expiredCookieOptions(request)}`);
}
