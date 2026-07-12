import type { DatabaseSync } from 'node:sqlite';
import { createRuntime, type Runtime } from '@praxis-flow/flow-core/server';
import { getBusinessDay } from '../db/database-time.js';
import type { OpsSettings } from '../db/db-types.js';
import {
  syncCatalogFromOpsSettings,
  type CatalogSyncSummary,
} from './sync-catalog-from-ops-settings.js';

let flowCoreRuntime: Runtime | null = null;
let flowCoreRuntimeDb: DatabaseSync | null = null;

export function resetFlowCoreRuntimeForTests(): void {
  flowCoreRuntime = null;
  flowCoreRuntimeDb = null;
}

export function getFlowCoreRuntime(db: DatabaseSync): Runtime {
  if (!flowCoreRuntime || flowCoreRuntimeDb !== db) {
    flowCoreRuntime = createRuntime(db, { resolveBusinessDay: getBusinessDay });
    flowCoreRuntimeDb = db;
  }
  return flowCoreRuntime;
}

export function syncFlowCoreCatalog(db: DatabaseSync, settings: OpsSettings): CatalogSyncSummary {
  const summary = syncCatalogFromOpsSettings(db, settings);
  resetFlowCoreRuntimeForTests();
  flowCoreRuntime = createRuntime(db, { resolveBusinessDay: getBusinessDay });
  flowCoreRuntimeDb = db;
  return summary;
}
