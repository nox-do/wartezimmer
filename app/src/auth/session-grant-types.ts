import type { ClientRole } from './client-auth.js';
import type { RoomPanelPlacement } from '../shared/db/db-types.js';

export type StaffRole = Extract<ClientRole, 'mfa' | 'ops'>;
export type DeviceSessionRole = Extract<ClientRole, 'terminal' | 'tv'>;
export type RoomPanelGrantRole = Extract<ClientRole, 'room-panel'>;

/** In-memory MFA/OPS session (idle + absolute TTL). */
export type StaffSession = {
  kind: 'staff';
  sessionId: string;
  role: StaffRole;
  createdAt: string;
  lastSeenAt: string;
  idleExpiresAt: string;
  expiresAt: string;
};

/** Authenticated device authorization (TV/Terminal); no staff-style TTL. */
export type DeviceGrant = {
  kind: 'device';
  /** `device_authorizations.authorization_id` */
  sessionId: string;
  role: DeviceSessionRole;
  createdAt: string;
  lastSeenAt: string;
  deviceId: string;
};

/** Authenticated room-panel authorization; no staff-style TTL. */
export type RoomPanelGrant = {
  kind: 'room-panel';
  /** `device_authorizations.authorization_id` */
  sessionId: string;
  role: RoomPanelGrantRole;
  roomId: string;
  placement: RoomPanelPlacement;
  createdAt: string;
  lastSeenAt: string;
};

export type AuthSession = StaffSession | DeviceGrant | RoomPanelGrant;

export type StaffSessionAuthConfig = {
  pinHashesByRole: Record<StaffRole, string>;
  roomPanelPinHash: string;
  sessionTtlMs: number;
  sessionIdleTtlMs: number;
};

export type StaffPinHashConfig = Pick<
  StaffSessionAuthConfig,
  'pinHashesByRole' | 'roomPanelPinHash'
>;

export type StaffSessionManager = {
  createStaffSession(role: StaffRole, now?: Date): { token: string; session: StaffSession };
  getSession(token: string | null, now?: Date): StaffSession | null;
  revokeSession(token: string | null): void;
  revokeSessionsByRole(role: StaffRole, exceptSessionId?: string): void;
  subscribeSessionRevocation(sessionId: string, listener: () => void): () => void;
};

declare module 'fastify' {
  interface FastifyRequest {
    authSession?: AuthSession;
    staffSession?: StaffSession;
  }
}
