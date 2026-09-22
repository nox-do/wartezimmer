import type { DatabaseSync } from 'node:sqlite';
import { ensureFlowCoreSchema } from '../flow-core/flow-core-schema.js';
import { ensureAuthSettingsSchema } from './database-auth-settings.js';
import { ensureOpsSetupSchema } from './database-ops-setup.js';
import { ensureSandboxResetStateSchema } from './database-sandbox-reset-state.js';
import { runMigrations } from './migrations-runner.js';

/** Current production schema generation — not a migration history counter. */
export const SCHEMA_GENERATION = 1;

export class SchemaGenerationUnsupportedError extends Error {
  readonly generation: number;
  readonly supportedGeneration = SCHEMA_GENERATION;

  constructor(generation: number) {
    super(
      `Datenbank-Schema-Generation ${generation} wird nicht unterstützt (max. ${SCHEMA_GENERATION}). ` +
        'Bitte Upgrade über Manager-Backup/Restore durchführen.',
    );
    this.name = 'SchemaGenerationUnsupportedError';
    this.generation = generation;
  }
}

export function isUninitializedDatabase(db: DatabaseSync): boolean {
  const row = db
    .prepare(
      "SELECT 1 AS exists_flag FROM sqlite_master WHERE type = 'table' AND name = 'ops_state' LIMIT 1",
    )
    .get() as { exists_flag?: number } | undefined;
  return row?.exists_flag !== 1;
}

export function readSchemaGeneration(db: DatabaseSync): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined;
  return row?.user_version ?? 0;
}

export function assertSupportedSchemaGeneration(db: DatabaseSync): void {
  const generation = readSchemaGeneration(db);
  if (generation > SCHEMA_GENERATION) {
    throw new SchemaGenerationUnsupportedError(generation);
  }
}

export function assertForeignKeyIntegrity(db: DatabaseSync): void {
  const violations = db.prepare('PRAGMA foreign_key_check').all() as Array<Record<string, unknown>>;
  if (violations.length > 0) {
    throw new Error(
      `Foreign key check failed after schema build (${violations.length} violation(s))`,
    );
  }
}

/** Release A transition path for legacy databases (user_version 0). */
export function runTransitionSchemaEnsures(db: DatabaseSync): void {
  ensureOpsSetupSchema(db);
  ensureAuthSettingsSchema(db);
  ensureFlowCoreSchema(db);
  ensureSandboxResetStateSchema(db);
}

/**
 * Canonical fresh-database schema: app baseline, flow-core, portal FKs, host-state,
 * auth defaults. Sets `PRAGMA user_version` and validates FK integrity.
 */
export function createCurrentSchema(db: DatabaseSync): void {
  runMigrations(db);
  runTransitionSchemaEnsures(db);
  db.exec(`PRAGMA user_version = ${SCHEMA_GENERATION}`);
  assertForeignKeyIntegrity(db);
}
