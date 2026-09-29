import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { APP_DB_BASENAME } from './app-data-volume.js';
import { MaintenanceClientError, requestMaintenanceJson } from './maintenance-client.js';

export type DeviceAuthorizationAsideRow = {
  authorizationId: string;
  role: 'tv' | 'terminal' | 'room-panel';
  deviceId: string | null;
  roomId: string | null;
  placement: 'outside' | 'inside' | null;
  tokenHash: string;
  createdAt: string;
  lastSeenAt: string | null;
  updatedAt: string;
};

function tableExists(db: DatabaseSync, name: string): boolean {
  const row = db
    .prepare("SELECT 1 AS existsFlag FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(name) as { existsFlag?: number } | undefined;
  return row?.existsFlag === 1;
}

const DEVICE_AUTHORIZATION_ASIDE_COLUMNS = [
  'authorization_id',
  'role',
  'device_id',
  'room_id',
  'placement',
  'token_hash',
  'created_at',
  'last_seen_at',
  'updated_at',
  'revoked_at',
] as const;

function assertDeviceAuthorizationAsideSchema(db: DatabaseSync): void {
  const columns = new Set(
    (
      db.prepare('PRAGMA table_info(device_authorizations)').all() as Array<{ name?: unknown }>
    ).flatMap((row) => (typeof row.name === 'string' ? [row.name] : [])),
  );
  const missing = DEVICE_AUTHORIZATION_ASIDE_COLUMNS.filter((column) => !columns.has(column));
  if (missing.length > 0) {
    throw new Error(`DEVICE_AUTHORIZATION_SCHEMA_UNSUPPORTED: missing ${missing.join(', ')}`);
  }
}

export function readActiveDeviceAuthorizationsFromAside(
  asideDir: string,
): DeviceAuthorizationAsideRow[] {
  const dbPath = path.join(asideDir, APP_DB_BASENAME);
  if (!fs.existsSync(dbPath)) {
    return [];
  }

  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    if (!tableExists(db, 'device_authorizations')) {
      return [];
    }
    assertDeviceAuthorizationAsideSchema(db);
    const rows = db
      .prepare(
        `SELECT
          authorization_id AS authorizationId,
          role,
          device_id AS deviceId,
          room_id AS roomId,
          placement,
          token_hash AS tokenHash,
          created_at AS createdAt,
          last_seen_at AS lastSeenAt,
          updated_at AS updatedAt
         FROM device_authorizations
         WHERE revoked_at IS NULL
         ORDER BY created_at ASC, authorization_id ASC`,
      )
      .all() as Array<Record<string, unknown>>;

    return rows.flatMap((row) => {
      if (
        typeof row.authorizationId !== 'string' ||
        (row.role !== 'tv' && row.role !== 'terminal' && row.role !== 'room-panel') ||
        typeof row.tokenHash !== 'string' ||
        typeof row.createdAt !== 'string' ||
        typeof row.updatedAt !== 'string'
      ) {
        return [];
      }
      const placement =
        row.placement === 'outside' || row.placement === 'inside' ? row.placement : null;
      return [
        {
          authorizationId: row.authorizationId,
          role: row.role,
          deviceId: typeof row.deviceId === 'string' ? row.deviceId : null,
          roomId: typeof row.roomId === 'string' ? row.roomId : null,
          placement,
          tokenHash: row.tokenHash,
          createdAt: row.createdAt,
          lastSeenAt: typeof row.lastSeenAt === 'string' ? row.lastSeenAt : null,
          updatedAt: row.updatedAt,
        },
      ];
    });
  } finally {
    db.close();
  }
}

export async function copyDeviceAuthorizationsFromAsideViaApp(
  asideDir: string,
  localMaintenanceAppBaseUrl: string,
): Promise<{ ok: true; imported: number } | { ok: false; errors: string[] }> {
  let rows: DeviceAuthorizationAsideRow[];
  try {
    rows = readActiveDeviceAuthorizationsFromAside(asideDir);
  } catch (error) {
    return {
      ok: false,
      errors: [
        error instanceof Error
          ? error.message
          : 'Gerätefreigaben konnten aus der alten Datenbank nicht gelesen werden.',
      ],
    };
  }

  if (rows.length === 0) {
    return { ok: true, imported: 0 };
  }

  try {
    const body = await requestMaintenanceJson(
      '/api/v1/ops/device-authorizations/import',
      localMaintenanceAppBaseUrl,
      { method: 'POST', body: { authorizations: rows }, timeoutMs: 30_000 },
    );
    if (body.ok !== true) {
      return {
        ok: false,
        errors: [
          typeof body.message === 'string'
            ? body.message
            : 'Gerätefreigaben-Import wurde abgelehnt.',
        ],
      };
    }
    return {
      ok: true,
      imported: typeof body.imported === 'number' ? body.imported : rows.length,
    };
  } catch (error) {
    const responseBody = error instanceof MaintenanceClientError ? error.responseBody : undefined;
    return {
      ok: false,
      errors: [
        typeof responseBody?.message === 'string'
          ? responseBody.message
          : error instanceof Error
            ? error.message
            : 'Gerätefreigaben-Import über die Maintenance-API ist fehlgeschlagen.',
      ],
    };
  }
}
