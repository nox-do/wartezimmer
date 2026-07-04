import type { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const flowCoreRoot = join(fileURLToPath(import.meta.url), '../../../../../packages/flow-core');
const schemaPath = join(flowCoreRoot, 'db/schema.sql');

export function flowCoreSchemaSql(): string {
  return readFileSync(schemaPath, 'utf8');
}

export function ensureFlowCoreSchema(db: DatabaseSync): void {
  db.exec(flowCoreSchemaSql());
}

export function clearFlowCoreVisitRuntime(db: DatabaseSync): void {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('DELETE FROM visit_events');
  db.exec('DELETE FROM visit_topics');
  db.exec('DELETE FROM visits');
  db.exec('DELETE FROM patients');
  db.exec('DELETE FROM daily_queue_counters');
  db.exec('PRAGMA foreign_keys = ON');
}
