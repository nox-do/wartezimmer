import type { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureVisitHostStateSchema } from '../db/visit-host-state.js';
import { ensureVisitPortalSchema } from '../db/visit-portal-schema.js';
import { ensureVisitLegacyDropSchema } from '../db/visit-legacy-drop-schema.js';

const flowCoreRoot = join(fileURLToPath(import.meta.url), '../../../../../packages/flow-core');
const schemaPath = join(flowCoreRoot, 'db/schema.sql');

export function flowCoreSchemaSql(): string {
  return readFileSync(schemaPath, 'utf8');
}

export function ensureFlowCoreSchema(db: DatabaseSync): void {
  db.exec(flowCoreSchemaSql());
  ensureVisitHostStateSchema(db);
  ensureVisitPortalSchema(db);
  ensureVisitLegacyDropSchema(db);
}

const CATALOG_TABLES = [
  'surface_display_rules',
  'routing_rules',
  'journey_steps',
  'journey_templates',
  'surfaces',
  'queues',
  'locations',
  'topics',
] as const;

export function clearFlowCoreCatalog(db: DatabaseSync): void {
  db.exec('PRAGMA foreign_keys = OFF');
  for (const table of CATALOG_TABLES) {
    db.exec(`DELETE FROM ${table}`);
  }
  db.exec('PRAGMA foreign_keys = ON');
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
