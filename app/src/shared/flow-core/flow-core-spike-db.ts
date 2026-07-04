import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import { ensureFlowCoreSchema, flowCoreSchemaSql } from './flow-core-schema.js';

export { ensureFlowCoreSchema, flowCoreSchemaSql, clearFlowCoreVisitRuntime } from './flow-core-schema.js';

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

export function resolveFlowCoreSpikeDbPath(): string {
  if (process.env.FLOW_CORE_SPIKE_DB_PATH) {
    return process.env.FLOW_CORE_SPIKE_DB_PATH;
  }
  const mainDb = process.env.DB_PATH ?? '/var/lib/praxis-flow/app/praxis-flow.db';
  if (mainDb === ':memory:') {
    return ':memory:';
  }
  return join(dirname(mainDb), 'flow-core-spike.sqlite');
}

export function openFlowCoreSpikeDb(options: { path?: string; resetCatalog?: boolean } = {}): DatabaseSync {
  const path = options.path ?? resolveFlowCoreSpikeDbPath();
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  if (path !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL');
  }
  ensureFlowCoreSchema(db);
  if (options.resetCatalog) {
    clearFlowCoreCatalog(db);
  }
  return db;
}

export function clearFlowCoreCatalog(db: DatabaseSync): void {
  db.exec('PRAGMA foreign_keys = OFF');
  for (const table of CATALOG_TABLES) {
    db.exec(`DELETE FROM ${table}`);
  }
  db.exec('PRAGMA foreign_keys = ON');
}
