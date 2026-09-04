import type { FastifyRequest } from 'fastify';
import type { DeviceSessionRole, StaffRole } from './session-grant-types.js';

export type CookieSlotRole = StaffRole | DeviceSessionRole | 'room-panel';

const COOKIE_SLOT_ROLES = new Set<CookieSlotRole>(['mfa', 'ops', 'terminal', 'tv', 'room-panel']);

export function readRequestedCookieSlotRole(request: FastifyRequest): CookieSlotRole | null {
  const header = request.headers['x-client-role'];
  if (typeof header !== 'string') {
    return null;
  }

  const value = header.trim().toLowerCase();
  return COOKIE_SLOT_ROLES.has(value as CookieSlotRole) ? (value as CookieSlotRole) : null;
}
