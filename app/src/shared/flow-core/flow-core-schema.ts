import type { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensureVisitEventAuditColumns,
  ensureVisitSupersedeColumns,
} from '@praxis-flow/flow-core/server';
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
  ensureVisitEventAuditColumns(db);
  ensureVisitSupersedeColumns(db);
  ensureVisitHostStateSchema(db);
  ensureVisitPortalSchema(db);
  ensureVisitLegacyDropSchema(db);
}

function tableExists(db: DatabaseSync, table: string): boolean {
  const row = db
    .prepare("SELECT 1 AS exists_flag FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(table) as { exists_flag?: number } | undefined;
  return row?.exists_flag === 1;
}

function deleteAllFromIfExists(db: DatabaseSync, table: string): void {
  if (!tableExists(db, table)) {
    return;
  }
  db.exec(`DELETE FROM ${table}`);
}

/**
 * Clears visit runtime rows with foreign_keys ON.
 * Children without CASCADE first, then host/portal tables (legacy DBs lack visit CASCADE),
 * then visits, patients, daily counters.
 */
export function clearFlowCoreVisitRuntime(db: DatabaseSync): void {
  deleteAllFromIfExists(db, 'visit_events');
  deleteAllFromIfExists(db, 'visit_topics');
  deleteAllFromIfExists(db, 'documents');
  deleteAllFromIfExists(db, 'patient_sessions');
  deleteAllFromIfExists(db, 'visit_host_state');
  deleteAllFromIfExists(db, 'visits');
  deleteAllFromIfExists(db, 'patients');
  deleteAllFromIfExists(db, 'daily_queue_counters');
}
