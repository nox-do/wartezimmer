import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASELINE_FILE = '001_baseline.sql';

function resolveMigrationDirectory(): string {
  const candidates = [
    path.resolve(process.cwd(), 'app/src/shared/db/migrations'),
    path.resolve(__dirname, 'migrations'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error('Migration directory not found');
}

/**
 * Fresh databases only: apply baseline SQL when no schema exists.
 * Schema changes require deleting the SQLite file / Docker volume and restarting.
 */
export function runMigrations(db: DatabaseSync): void {
  const initialized = db
    .prepare(
      "SELECT 1 AS exists_flag FROM sqlite_master WHERE type = 'table' AND name = 'ops_state' LIMIT 1",
    )
    .get() as { exists_flag?: number } | undefined;

  if (initialized?.exists_flag === 1) {
    return;
  }

  const baselinePath = path.join(resolveMigrationDirectory(), BASELINE_FILE);
  if (!fs.existsSync(baselinePath)) {
    throw new Error(`Baseline schema not found: ${BASELINE_FILE}`);
  }
  db.exec(fs.readFileSync(baselinePath, 'utf8'));
}
