import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { RoomPanelPlacement } from './db-types.js';

export const DEVICE_AUTHORIZATION_TOUCH_MIN_INTERVAL_MS = 60_000;

export type DeviceAuthorizationRole = 'tv' | 'terminal' | 'room-panel';
export type DeviceSlotRole = Exclude<DeviceAuthorizationRole, 'room-panel'>;

export type DeviceAuthorizationRow = {
  authorizationId: string;
  role: DeviceAuthorizationRole;
  deviceId: string | null;
  roomId: string | null;
  placement: RoomPanelPlacement | null;
  tokenHash: string;
  createdAt: string;
  lastSeenAt: string | null;
  updatedAt: string;
  revokedAt: string | null;
};

export type DeviceAuthorizationCopyRow = Omit<DeviceAuthorizationRow, 'revokedAt'>;

export type DeviceAuthorizationDeps = {
  insertAuthorizationStmt: StatementSync;
  getByTokenHashStmt: StatementSync;
  getByIdStmt: StatementSync;
  listActiveStmt: StatementSync;
  revokeByIdStmt: StatementSync;
  revokeActiveSlotStmt: StatementSync;
  revokeRoomStmt: StatementSync;
  revokePlacementStmt: StatementSync;
  revokeAllPanelsStmt: StatementSync;
  touchStmt: StatementSync;
  nowIso: () => string;
};

const SELECT_ROW = `
  authorization_id AS authorizationId,
  role,
  device_id AS deviceId,
  room_id AS roomId,
  placement,
  token_hash AS tokenHash,
  created_at AS createdAt,
  last_seen_at AS lastSeenAt,
  updated_at AS updatedAt,
  revoked_at AS revokedAt
`;

export function hashDeviceAuthorizationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function prepareDeviceAuthorizationStatements(db: DatabaseSync) {
  return {
    insertAuthorizationStmt: db.prepare(
      `INSERT INTO device_authorizations (
        authorization_id, role, device_id, room_id, placement,
        token_hash, created_at, last_seen_at, updated_at, revoked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    ),
    getByTokenHashStmt: db.prepare(
      `SELECT ${SELECT_ROW}
       FROM device_authorizations
       WHERE token_hash = ? AND revoked_at IS NULL
       LIMIT 1`,
    ),
    getByIdStmt: db.prepare(
      `SELECT ${SELECT_ROW}
       FROM device_authorizations
       WHERE authorization_id = ?
       LIMIT 1`,
    ),
    listActiveStmt: db.prepare(
      `SELECT ${SELECT_ROW}
       FROM device_authorizations
       WHERE revoked_at IS NULL
       ORDER BY created_at ASC, authorization_id ASC`,
    ),
    revokeByIdStmt: db.prepare(
      `UPDATE device_authorizations
       SET revoked_at = ?, updated_at = ?
       WHERE authorization_id = ? AND revoked_at IS NULL`,
    ),
    revokeActiveSlotStmt: db.prepare(
      `UPDATE device_authorizations
       SET revoked_at = ?, updated_at = ?
       WHERE role = ? AND device_id = ? AND revoked_at IS NULL`,
    ),
    revokeRoomStmt: db.prepare(
      `UPDATE device_authorizations
       SET revoked_at = ?, updated_at = ?
       WHERE role = 'room-panel' AND room_id = ? AND revoked_at IS NULL`,
    ),
    revokePlacementStmt: db.prepare(
      `UPDATE device_authorizations
       SET revoked_at = ?, updated_at = ?
       WHERE role = 'room-panel' AND room_id = ? AND placement = ? AND revoked_at IS NULL`,
    ),
    revokeAllPanelsStmt: db.prepare(
      `UPDATE device_authorizations
       SET revoked_at = ?, updated_at = ?
       WHERE role = 'room-panel' AND revoked_at IS NULL`,
    ),
    touchStmt: db.prepare(
      `UPDATE device_authorizations
       SET last_seen_at = ?, updated_at = ?
       WHERE authorization_id = ? AND revoked_at IS NULL`,
    ),
  };
}

export function createDeviceAuthorizationDeps(
  db: DatabaseSync,
  nowIso: () => string,
): DeviceAuthorizationDeps {
  return {
    ...prepareDeviceAuthorizationStatements(db),
    nowIso,
  };
}

function mapRow(row: Record<string, unknown> | undefined): DeviceAuthorizationRow | null {
  if (!row || typeof row.authorizationId !== 'string' || typeof row.role !== 'string') {
    return null;
  }
  if (row.role !== 'tv' && row.role !== 'terminal' && row.role !== 'room-panel') {
    return null;
  }
  const placement = row.placement;
  return {
    authorizationId: row.authorizationId,
    role: row.role,
    deviceId: typeof row.deviceId === 'string' ? row.deviceId : null,
    roomId: typeof row.roomId === 'string' ? row.roomId : null,
    placement: placement === 'outside' || placement === 'inside' ? placement : null,
    tokenHash: String(row.tokenHash),
    createdAt: String(row.createdAt),
    lastSeenAt: typeof row.lastSeenAt === 'string' ? row.lastSeenAt : null,
    updatedAt: String(row.updatedAt),
    revokedAt: typeof row.revokedAt === 'string' ? row.revokedAt : null,
  };
}

function insertRow(
  deps: DeviceAuthorizationDeps,
  row: DeviceAuthorizationCopyRow,
): DeviceAuthorizationRow {
  deps.insertAuthorizationStmt.run(
    row.authorizationId,
    row.role,
    row.deviceId,
    row.roomId,
    row.placement,
    row.tokenHash,
    row.createdAt,
    row.lastSeenAt,
    row.updatedAt,
  );
  const stored = mapRow(
    deps.getByIdStmt.get(row.authorizationId) as Record<string, unknown> | undefined,
  );
  if (!stored) {
    throw new Error('DEVICE_AUTHORIZATION_INSERT_FAILED');
  }
  return stored;
}

function newSlotCopyRow(
  deps: DeviceAuthorizationDeps,
  input: { role: DeviceSlotRole; deviceId: string; token: string },
): DeviceAuthorizationCopyRow {
  const now = deps.nowIso();
  return {
    authorizationId: randomUUID(),
    role: input.role,
    deviceId: input.deviceId,
    roomId: null,
    placement: null,
    tokenHash: hashDeviceAuthorizationToken(input.token),
    createdAt: now,
    lastSeenAt: now,
    updatedAt: now,
  };
}

export function createSlotDeviceAuthorization(
  deps: DeviceAuthorizationDeps,
  input: { role: DeviceSlotRole; deviceId: string; token: string },
): DeviceAuthorizationRow {
  return insertRow(deps, newSlotCopyRow(deps, input));
}

export function replaceSlotDeviceAuthorization(
  deps: DeviceAuthorizationDeps,
  input: { role: DeviceSlotRole; deviceId: string; token: string },
): DeviceAuthorizationRow {
  const now = deps.nowIso();
  deps.revokeActiveSlotStmt.run(now, now, input.role, input.deviceId);
  return insertRow(deps, newSlotCopyRow(deps, input));
}

export function enrollRoomPanelDeviceAuthorization(
  deps: DeviceAuthorizationDeps,
  input: { roomId: string; placement: RoomPanelPlacement; token: string },
): DeviceAuthorizationRow {
  const now = deps.nowIso();
  return insertRow(deps, {
    authorizationId: randomUUID(),
    role: 'room-panel',
    deviceId: null,
    roomId: input.roomId,
    placement: input.placement,
    tokenHash: hashDeviceAuthorizationToken(input.token),
    createdAt: now,
    lastSeenAt: now,
    updatedAt: now,
  });
}

export function authenticateDeviceAuthorization(
  deps: Pick<DeviceAuthorizationDeps, 'getByTokenHashStmt'>,
  token: string,
): DeviceAuthorizationRow | null {
  return mapRow(
    deps.getByTokenHashStmt.get(hashDeviceAuthorizationToken(token)) as
      | Record<string, unknown>
      | undefined,
  );
}

export function getDeviceAuthorizationById(
  deps: Pick<DeviceAuthorizationDeps, 'getByIdStmt'>,
  authorizationId: string,
): DeviceAuthorizationRow | null {
  return mapRow(deps.getByIdStmt.get(authorizationId) as Record<string, unknown> | undefined);
}

export function listActiveDeviceAuthorizations(
  deps: Pick<DeviceAuthorizationDeps, 'listActiveStmt'>,
): DeviceAuthorizationRow[] {
  const rows = deps.listActiveStmt.all() as Array<Record<string, unknown>>;
  return rows
    .map((row) => mapRow(row))
    .filter((row): row is DeviceAuthorizationRow => row !== null);
}

export function touchDeviceAuthorization(
  deps: DeviceAuthorizationDeps,
  authorizationId: string,
): DeviceAuthorizationRow | null {
  const existing = mapRow(
    deps.getByIdStmt.get(authorizationId) as Record<string, unknown> | undefined,
  );
  if (!existing || existing.revokedAt) {
    return null;
  }
  const now = deps.nowIso();
  if (existing.lastSeenAt) {
    const elapsed = Date.parse(now) - Date.parse(existing.lastSeenAt);
    if (Number.isFinite(elapsed) && elapsed < DEVICE_AUTHORIZATION_TOUCH_MIN_INTERVAL_MS) {
      return existing;
    }
  }
  deps.touchStmt.run(now, now, authorizationId);
  return mapRow(deps.getByIdStmt.get(authorizationId) as Record<string, unknown> | undefined);
}

export function revokeDeviceAuthorizationById(
  deps: DeviceAuthorizationDeps,
  authorizationId: string,
): boolean {
  const now = deps.nowIso();
  const result = deps.revokeByIdStmt.run(now, now, authorizationId) as { changes?: number };
  return (result.changes ?? 0) > 0;
}

export function revokeDeviceAuthorizationsByDevice(
  deps: DeviceAuthorizationDeps,
  role: DeviceSlotRole,
  deviceId: string,
): number {
  const now = deps.nowIso();
  const result = deps.revokeActiveSlotStmt.run(now, now, role, deviceId) as { changes?: number };
  return result.changes ?? 0;
}

export function revokeRoomPanelAuthorizationsByRoom(
  deps: DeviceAuthorizationDeps,
  roomId: string,
): number {
  const now = deps.nowIso();
  const result = deps.revokeRoomStmt.run(now, now, roomId) as { changes?: number };
  return result.changes ?? 0;
}

export function revokeRoomPanelAuthorizationsByPlacement(
  deps: DeviceAuthorizationDeps,
  roomId: string,
  placement: RoomPanelPlacement,
): number {
  const now = deps.nowIso();
  const result = deps.revokePlacementStmt.run(now, now, roomId, placement) as {
    changes?: number;
  };
  return result.changes ?? 0;
}

export function revokeAllRoomPanelAuthorizations(deps: DeviceAuthorizationDeps): number {
  const now = deps.nowIso();
  const result = deps.revokeAllPanelsStmt.run(now, now) as { changes?: number };
  return result.changes ?? 0;
}

export function importActiveDeviceAuthorizations(
  deps: DeviceAuthorizationDeps,
  rows: DeviceAuthorizationCopyRow[],
): number {
  for (const row of rows) {
    insertRow(deps, {
      authorizationId: row.authorizationId,
      role: row.role,
      deviceId: row.deviceId,
      roomId: row.roomId,
      placement: row.placement,
      tokenHash: row.tokenHash,
      createdAt: row.createdAt,
      lastSeenAt: row.lastSeenAt,
      updatedAt: row.updatedAt,
    });
  }
  return rows.length;
}

export function toDeviceAuthorizationCopyRow(
  row: DeviceAuthorizationRow,
): DeviceAuthorizationCopyRow {
  const { revokedAt: _revokedAt, ...copy } = row;
  return copy;
}

const TOKEN_HASH_PATTERN = /^[a-f0-9]{64}$/;

function isDeviceAuthorizationRole(value: unknown): value is DeviceAuthorizationRole {
  return value === 'tv' || value === 'terminal' || value === 'room-panel';
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

export function parseDeviceAuthorizationCopyRows(
  body: unknown,
): { ok: true; rows: DeviceAuthorizationCopyRow[] } | { ok: false; message: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, message: 'authorizations array is required.' };
  }
  const authorizations = (body as { authorizations?: unknown }).authorizations;
  if (!Array.isArray(authorizations)) {
    return { ok: false, message: 'authorizations array is required.' };
  }

  const rows: DeviceAuthorizationCopyRow[] = [];
  for (const [index, raw] of authorizations.entries()) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, message: `authorizations[${index}] is invalid.` };
    }
    const entry = raw as Record<string, unknown>;
    if (typeof entry.authorizationId !== 'string' || entry.authorizationId.trim().length === 0) {
      return { ok: false, message: `authorizations[${index}].authorizationId is invalid.` };
    }
    if (!isDeviceAuthorizationRole(entry.role)) {
      return { ok: false, message: `authorizations[${index}].role is invalid.` };
    }
    if (typeof entry.tokenHash !== 'string' || !TOKEN_HASH_PATTERN.test(entry.tokenHash)) {
      return { ok: false, message: `authorizations[${index}].tokenHash is invalid.` };
    }
    if (!isIsoTimestamp(entry.createdAt) || !isIsoTimestamp(entry.updatedAt)) {
      return { ok: false, message: `authorizations[${index}] timestamps are invalid.` };
    }
    const lastSeenAt =
      entry.lastSeenAt === null || entry.lastSeenAt === undefined
        ? null
        : isIsoTimestamp(entry.lastSeenAt)
          ? entry.lastSeenAt
          : null;
    if (entry.lastSeenAt !== null && entry.lastSeenAt !== undefined && lastSeenAt === null) {
      return { ok: false, message: `authorizations[${index}].lastSeenAt is invalid.` };
    }

    const deviceId = entry.deviceId === null || entry.deviceId === undefined ? null : entry.deviceId;
    const roomId = entry.roomId === null || entry.roomId === undefined ? null : entry.roomId;
    const placement =
      entry.placement === null || entry.placement === undefined ? null : entry.placement;

    if (entry.role === 'room-panel') {
      if (deviceId !== null || typeof roomId !== 'string' || roomId.length === 0) {
        return { ok: false, message: `authorizations[${index}] panel fields are invalid.` };
      }
      if (placement !== 'outside' && placement !== 'inside') {
        return { ok: false, message: `authorizations[${index}].placement is invalid.` };
      }
      rows.push({
        authorizationId: entry.authorizationId.trim(),
        role: 'room-panel',
        deviceId: null,
        roomId,
        placement,
        tokenHash: entry.tokenHash,
        createdAt: entry.createdAt,
        lastSeenAt,
        updatedAt: entry.updatedAt,
      });
      continue;
    }

    if (typeof deviceId !== 'string' || deviceId.length === 0 || roomId !== null || placement !== null) {
      return { ok: false, message: `authorizations[${index}] slot fields are invalid.` };
    }
    rows.push({
      authorizationId: entry.authorizationId.trim(),
      role: entry.role,
      deviceId,
      roomId: null,
      placement: null,
      tokenHash: entry.tokenHash,
      createdAt: entry.createdAt,
      lastSeenAt,
      updatedAt: entry.updatedAt,
    });
  }

  return { ok: true, rows };
}
