import type { DatabaseSync } from 'node:sqlite';
import { createRuntime, type Runtime } from '@wartezimmer/flow-core/server';
import { getBusinessDay } from '../db/database-time.js';
import type { OpsSettings } from '../db/db-types.js';
import { PF_FLOW_LOC_WAITING, PF_FLOW_QUEUE_GENERAL } from './catalog-ids.js';
import {
  syncCatalogFromOpsSettings,
  type CatalogSyncSummary,
} from './sync-catalog-from-ops-settings.js';

let flowCoreRuntime: Runtime | null = null;
let flowCoreRuntimeDb: DatabaseSync | null = null;

function createAppRuntime(db: DatabaseSync): Runtime {
  return createRuntime(db, {
    resolveBusinessDay: getBusinessDay,
    // Rueckkehr bedeutet in der Praxis immer das gemeinsame Wartezimmer,
    // unabhaengig von Check-in-Rule und aktuellem Journey-Schritt.
    returnToWaitingDestination: {
      locationId: PF_FLOW_LOC_WAITING,
      queueId: PF_FLOW_QUEUE_GENERAL,
    },
  });
}

export function resetFlowCoreRuntimeForTests(): void {
  flowCoreRuntime = null;
  flowCoreRuntimeDb = null;
}

export function getFlowCoreRuntime(db: DatabaseSync): Runtime {
  if (!flowCoreRuntime || flowCoreRuntimeDb !== db) {
    flowCoreRuntime = createAppRuntime(db);
    flowCoreRuntimeDb = db;
  }
  return flowCoreRuntime;
}

export function syncFlowCoreCatalog(db: DatabaseSync, settings: OpsSettings): CatalogSyncSummary {
  const summary = syncCatalogFromOpsSettings(db, settings);
  resetFlowCoreRuntimeForTests();
  flowCoreRuntime = createAppRuntime(db);
  flowCoreRuntimeDb = db;
  return summary;
}
