import type { ClientRole } from './client-auth.js';
import type { RoomPanelPlacement } from '../shared/db/db-types.js';

export type StaffRole = Extract<ClientRole, 'mfa' | 'ops'>;
export type DeviceSessionRole = Extract<ClientRole, 'terminal' | 'tv'>;
export type RoomPanelSessionRole = Extract<ClientRole, 'room-panel'>;

export type StaffSession = {
  kind: 'staff';
  sessionId: string;
  role: StaffRole;
  createdAt: string;
  lastSeenAt: string;
  idleExpiresAt: string;
  expiresAt: string;
};

export type DeviceSession = {
  kind: 'device';
  sessionId: string;
  role: DeviceSessionRole;
  createdAt: string;
  lastSeenAt: string;
  idleExpiresAt: string;
  expiresAt: string;
  deviceId: string;
};

export type RoomPanelSession = {
  kind: 'room-panel';
  sessionId: string;
  role: RoomPanelSessionRole;
  roomId: string;
  placement: RoomPanelPlacement;
  clientKey?: string;
  createdAt: string;
  lastSeenAt: string;
  idleExpiresAt: string;
  expiresAt: string;
};

export type AuthSession = StaffSession | DeviceSession | RoomPanelSession;

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
  createRoomPanelSession(
    input: { roomId: string; placement: RoomPanelPlacement; clientKey?: string },
    now?: Date,
  ): { token: string; session: RoomPanelSession };
  getSession(token: string | null, now?: Date): AuthSession | null;
  refreshSession(sessionId: string, now?: Date): AuthSession | null;
  countRoomPanelSessions(input: { clientKey: string; placement?: RoomPanelPlacement }): number;
  revokeSession(token: string | null): void;
  revokeSessionsByRole(role: StaffRole | RoomPanelSessionRole, exceptSessionId?: string): void;
  revokeRoomPanelSessions(roomId: string, exceptSessionId?: string): void;
  revokeRoomPanelSessionsByPlacement(placement: RoomPanelPlacement): void;
  revokeRoomPanelSessionPlacement(
    roomId: string,
    placement: RoomPanelPlacement,
    exceptSessionId?: string,
  ): void;
  subscribeSessionRevocation(sessionId: string, listener: () => void): () => void;
};

declare module 'fastify' {
  interface FastifyRequest {
    authSession?: AuthSession;
    staffSession?: StaffSession;
  }
}
