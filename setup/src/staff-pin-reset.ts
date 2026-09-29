import { DEFAULT_STAFF_PIN_HASH } from '@praxis-flow/server-shared';
import { runDockerCommand } from './docker-cli.js';

export const APP_DB_PATH = '/var/lib/praxis-flow/app/praxis-flow.db';

export function appDataVolumeName(composeProjectName: string): string {
  return `${composeProjectName}_app_data`;
}

const RESET_STAFF_PINS_SCRIPT = `
import { DatabaseSync } from 'node:sqlite';

const hash = process.env.STAFF_PIN_HASH;
if (!hash) {
  throw new Error('STAFF_PIN_HASH missing');
}

const dbPath = '/var/lib/praxis-flow/app/praxis-flow.db';
const db = new DatabaseSync(dbPath);
const requiredColumns = new Set([
  'id',
  'staff_pin_hash_mfa',
  'staff_pin_hash_ops',
  'room_panel_pin_hash',
  'updated_at',
]);
const existingColumns = new Set(
  db.prepare('PRAGMA table_info(auth_settings)').all().map((row) => row.name),
);
const missingColumns = [...requiredColumns].filter((name) => !existingColumns.has(name));
if (existingColumns.size > 0 && missingColumns.length > 0) {
  throw new Error('AUTH_SETTINGS_SCHEMA_UNSUPPORTED: missing ' + missingColumns.join(', '));
}
const exists = db
  .prepare("SELECT 1 AS n FROM auth_settings WHERE id = 'singleton' LIMIT 1")
  .get();
const now = new Date().toISOString();

if (!exists) {
  db.prepare(
    \`INSERT INTO auth_settings (
      id,
      staff_pin_hash_mfa,
      staff_pin_hash_ops,
      room_panel_pin_hash,
      updated_at
    ) VALUES ('singleton', ?, ?, ?, ?)\`,
  ).run(hash, hash, hash, now);
} else {
  db.prepare(
    \`UPDATE auth_settings
     SET staff_pin_hash_mfa = ?,
         staff_pin_hash_ops = ?,
         updated_at = ?
     WHERE id = 'singleton'\`,
  ).run(hash, hash, now);
}
`.trim();

export async function resetStaffPinsInAppDatabase(
  composeProjectName: string,
): Promise<{ ok: boolean; log: string; databaseUpdated: boolean }> {
  const volume = appDataVolumeName(composeProjectName);
  const exists = await runDockerCommand([
    'run',
    '--rm',
    '-v',
    `${volume}:/var/lib/praxis-flow/app`,
    'node:22-alpine',
    'test',
    '-f',
    APP_DB_PATH,
  ]);
  if (exists.code !== 0) {
    return {
      ok: true,
      log: 'Keine App-Datenbank — Default-PINs gelten nach erstem Start.',
      databaseUpdated: false,
    };
  }

  const result = await runDockerCommand([
    'run',
    '--rm',
    '-e',
    `STAFF_PIN_HASH=${DEFAULT_STAFF_PIN_HASH}`,
    '-v',
    `${volume}:/var/lib/praxis-flow/app`,
    'node:22-alpine',
    'node',
    '--input-type=module',
    '-e',
    RESET_STAFF_PINS_SCRIPT,
  ]);

  if (result.code !== 0) {
    return {
      ok: false,
      log: result.stderr || result.stdout || 'Staff-PIN-Reset in der Datenbank fehlgeschlagen',
      databaseUpdated: false,
    };
  }

  return {
    ok: true,
    log: 'MFA- und Ops-PIN in der Datenbank auf Default gesetzt.',
    databaseUpdated: true,
  };
}
