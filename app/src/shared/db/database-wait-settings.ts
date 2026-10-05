import type { DatabaseSync } from 'node:sqlite';

export const DEFAULT_LONG_WAIT_THRESHOLD_MINUTES = 25;
export function isValidLongWaitThreshold(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 240;
}

/** Additive host preference; preserves existing installations and their settings. */
export function ensureWaitSettingsSchema(db: DatabaseSync): void {
  const columns = db.prepare('PRAGMA table_info(ops_settings)').all() as { name: string }[];
  if (!columns.some((column) => column.name === 'long_wait_threshold_minutes')) {
    db.exec(
      `ALTER TABLE ops_settings ADD COLUMN long_wait_threshold_minutes INTEGER NOT NULL DEFAULT ${DEFAULT_LONG_WAIT_THRESHOLD_MINUTES} CHECK (long_wait_threshold_minutes BETWEEN 1 AND 240)`,
    );
  }
}
