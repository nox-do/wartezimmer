import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { DeviceSessionRole } from '../../auth/staff-session-types.js';
import type { RoomPanelPlacement } from './db-types.js';
import {
  authenticateDeviceAuthorization,
  createDeviceAuthorizationDeps,
  enrollRoomPanelDeviceAuthorization,
  getDeviceAuthorizationById,
  listActiveDeviceAuthorizations,
  replaceSlotDeviceAuthorization,
  revokeAllRoomPanelAuthorizations,
  revokeDeviceAuthorizationById,
  revokeRoomPanelAuthorizationsByPlacement,
  revokeRoomPanelAuthorizationsByRoom,
  touchDeviceAuthorization,
  type DeviceAuthorizationRow,
  type DeviceSlotRole,
} from './database-device-authorizations.js';

export type InMemoryDeviceGrantStore = {
  authenticateDeviceAuthorization(token: string): DeviceAuthorizationRow | null;
  touchDeviceAuthorization(authorizationId: string): DeviceAuthorizationRow | null;
  getDeviceAuthorizationById(authorizationId: string): DeviceAuthorizationRow | null;
  listActiveDeviceAuthorizations(): DeviceAuthorizationRow[];
  replaceSlotDeviceAuthorization(input: {
    role: DeviceSlotRole;
    deviceId: string;
    token: string;
  }): DeviceAuthorizationRow;
  createSlotDeviceAuthorization(input: {
    role: DeviceSlotRole;
    deviceId: string;
    token: string;
  }): DeviceAuthorizationRow;
  enrollRoomPanelDeviceAuthorization(input: {
    roomId: string;
    placement: RoomPanelPlacement;
    token: string;
  }): DeviceAuthorizationRow;
  revokeDeviceAuthorizationById(authorizationId: string): boolean;
  revokeDeviceAuthorizationByToken(token: string): boolean;
  revokeRoomPanelAuthorizationsByRoom(roomId: string): number;
  revokeRoomPanelAuthorizationsByPlacement(
    roomId: string,
    placement: RoomPanelPlacement,
  ): number;
  revokeAllRoomPanelAuthorizations(): number;
  issueDeviceCookie(role: DeviceSessionRole, deviceId?: string): { token: string; cookieName: string };
  issueRoomPanelCookie(
    roomId?: string,
    placement?: RoomPanelPlacement,
  ): { token: string; cookieName: string };
};

export function createInMemoryDeviceGrantStore(): InMemoryDeviceGrantStore {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE device_authorizations (
      authorization_id TEXT PRIMARY KEY,
      role TEXT NOT NULL CHECK (role IN ('tv', 'terminal', 'room-panel')),
      device_id TEXT,
      room_id TEXT,
      placement TEXT CHECK (placement IS NULL OR placement IN ('outside', 'inside')),
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      last_seen_at TEXT,
      updated_at TEXT NOT NULL,
      revoked_at TEXT
    );
    CREATE UNIQUE INDEX idx_device_authorizations_active_slot
      ON device_authorizations(role, device_id)
      WHERE revoked_at IS NULL AND role IN ('tv', 'terminal');
  `);
  const deps = createDeviceAuthorizationDeps(sqlite, () => new Date().toISOString());

  const replaceSlot = (input: { role: DeviceSlotRole; deviceId: string; token: string }) =>
    replaceSlotDeviceAuthorization(deps, input);

  return {
    authenticateDeviceAuthorization: (token) => authenticateDeviceAuthorization(deps, token),
    touchDeviceAuthorization: (authorizationId) =>
      touchDeviceAuthorization(deps, authorizationId),
    getDeviceAuthorizationById: (authorizationId) =>
      getDeviceAuthorizationById(deps, authorizationId),
    listActiveDeviceAuthorizations: () => listActiveDeviceAuthorizations(deps),
    replaceSlotDeviceAuthorization: replaceSlot,
    createSlotDeviceAuthorization: replaceSlot,
    enrollRoomPanelDeviceAuthorization: (input) =>
      enrollRoomPanelDeviceAuthorization(deps, input),
    revokeDeviceAuthorizationById: (authorizationId) =>
      revokeDeviceAuthorizationById(deps, authorizationId),
    revokeDeviceAuthorizationByToken(token) {
      const row = authenticateDeviceAuthorization(deps, token);
      if (!row) {
        return false;
      }
      return revokeDeviceAuthorizationById(deps, row.authorizationId);
    },
    revokeRoomPanelAuthorizationsByRoom: (roomId) =>
      revokeRoomPanelAuthorizationsByRoom(deps, roomId),
    revokeRoomPanelAuthorizationsByPlacement: (roomId, placement) =>
      revokeRoomPanelAuthorizationsByPlacement(deps, roomId, placement),
    revokeAllRoomPanelAuthorizations: () => revokeAllRoomPanelAuthorizations(deps),
    issueDeviceCookie(role, deviceId = `test-${role}`) {
      const token = randomBytes(32).toString('base64url');
      replaceSlot({ role, deviceId, token });
      const cookieName = role === 'tv' ? 'pf_tv_device_session' : 'pf_terminal_device_session';
      return { token, cookieName };
    },
    issueRoomPanelCookie(roomId = 'labor', placement = 'inside') {
      const token = randomBytes(32).toString('base64url');
      enrollRoomPanelDeviceAuthorization(deps, { roomId, placement, token });
      return { token, cookieName: 'pf_room_panel_session' };
    },
  };
}
