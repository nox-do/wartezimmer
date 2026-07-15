import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateCatalogIntegrity } from '@praxis-flow/flow-core';
import { loadCatalog } from './catalog-repository.js';
import { seedIfEmpty } from './seed.js';
import { projectRoot } from './paths.js';
import { ensureVisitEventAuditColumns } from './visit-event-audit-schema.js';
import { ensureVisitSupersedeColumns } from './visit-supersede-schema.js';

export const dbPath = join(projectRoot(), 'db/flow-core.sqlite');
const schemaPath = join(projectRoot(), 'db/schema.sql');

function assertCatalogIntegrity(db: DatabaseSync): void {
  validateCatalogIntegrity(loadCatalog(db));
}

export function openDb(options: { reset?: boolean; path?: string } = {}): DatabaseSync {
  const { reset = false, path = dbPath } = options;
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  if (reset) {
    db.exec('PRAGMA foreign_keys = OFF');
    for (const table of [
      'visit_events',
      'visit_topics',
      'visits',
      'daily_queue_counters',
      'journey_steps',
      'journey_templates',
      'routing_rules',
      'surface_display_rules',
      'surfaces',
      'queues',
      'locations',
      'topics',
      'patients',
    ]) {
      db.exec(`DROP TABLE IF EXISTS ${table}`);
    }
    db.exec('PRAGMA foreign_keys = ON');
  }
  db.exec(readFileSync(schemaPath, 'utf8'));
  ensureVisitEventAuditColumns(db);
  ensureVisitSupersedeColumns(db);
  seedIfEmpty(db);
  assertCatalogIntegrity(db);
  return db;
}
