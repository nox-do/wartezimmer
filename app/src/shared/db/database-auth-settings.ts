import type { DatabaseSync, StatementSync } from 'node:sqlite';
import {
  assertStaffPinHashConfigSafeForStartup,
  getAuthSettingsSeedConfig,
  type StaffPinHashConfig,
} from '../../auth/staff-session-auth.js';

export type AuthSettings = {
  staffPinHashMfa: string;
  staffPinHashOps: string;
  roomPanelPinHash: string;
  updatedAt: string;
};

export type AuthSettingsDeps = {
  getAuthSettingsStmt: StatementSync;
  updateAuthPinHashStmt: StatementSync;
  nowIso: () => string;
};

export type AuthPinTarget = 'mfa' | 'ops' | 'room-panel';

export function ensureAuthSettingsSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_settings (
      id TEXT PRIMARY KEY,
      staff_pin_hash_mfa TEXT NOT NULL,
      staff_pin_hash_ops TEXT NOT NULL,
      room_panel_pin_hash TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const existing = db
    .prepare("SELECT 1 AS existsFlag FROM auth_settings WHERE id = 'singleton' LIMIT 1")
    .get() as { existsFlag?: number } | undefined;
  if (existing?.existsFlag === 1) {
    return;
  }

  const seed = getAuthSettingsSeedConfig();
  assertStaffPinHashConfigSafeForStartup(seed);
  db.prepare(
    `
      INSERT INTO auth_settings (
      id,
      staff_pin_hash_mfa,
      staff_pin_hash_ops,
      room_panel_pin_hash,
      updated_at
    )
      VALUES ('singleton', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    `,
  ).run(seed.pinHashesByRole.mfa, seed.pinHashesByRole.ops, seed.roomPanelPinHash);
}

export function toStaffPinHashConfig(settings: AuthSettings): StaffPinHashConfig {
  return {
    pinHashesByRole: {
      mfa: settings.staffPinHashMfa,
      ops: settings.staffPinHashOps,
    },
    roomPanelPinHash: settings.roomPanelPinHash,
  };
}

export function getAuthSettingsFromDb(
  deps: Pick<AuthSettingsDeps, 'getAuthSettingsStmt'>,
): AuthSettings {
  const row = deps.getAuthSettingsStmt.get() as AuthSettings | undefined;
  if (!row) {
    throw new Error('AUTH_SETTINGS_MISSING');
  }
  assertStaffPinHashConfigSafeForStartup(toStaffPinHashConfig(row));
  return row;
}

export function updateAuthPinHashInDb(
  deps: AuthSettingsDeps,
  target: AuthPinTarget,
  pinHash: string,
): AuthSettings {
  deps.updateAuthPinHashStmt.run(
    target === 'mfa' ? pinHash : null,
    target === 'ops' ? pinHash : null,
    target === 'room-panel' ? pinHash : null,
    deps.nowIso(),
  );
  return getAuthSettingsFromDb(deps);
}
