import type { DatabaseSync } from 'node:sqlite';
import { createRuntime, type Runtime } from '@praxis-flow/flow-core/server';
import { getBusinessDay } from '../db/database-time.js';
import { openFlowCoreSpikeDb } from './flow-core-spike-db.js';
import { syncCatalogFromOpsSettings, type CatalogSyncSummary } from './sync-catalog-from-ops-settings.js';
import type { OpsSettings } from '../db/db-types.js';

let spikeDb: DatabaseSync | null = null;
let spikeRuntime: Runtime | null = null;

export function isFlowCoreSpikeEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.FLOW_CORE_SPIKE_ENABLED === '1';
}

export function resetFlowCoreSpikeRuntimeForTests(): void {
  spikeDb = null;
  spikeRuntime = null;
}

function getSpikeDb(): DatabaseSync {
  if (!spikeDb) {
    spikeDb = openFlowCoreSpikeDb();
  }
  return spikeDb;
}

export function getFlowCoreSpikeRuntime(): Runtime {
  if (!spikeRuntime) {
    spikeRuntime = createRuntime(getSpikeDb(), { resolveBusinessDay: getBusinessDay });
  }
  return spikeRuntime;
}

export function syncFlowCoreSpikeCatalog(settings: OpsSettings): CatalogSyncSummary {
  const db = getSpikeDb();
  const summary = syncCatalogFromOpsSettings(db, settings);
  spikeRuntime = createRuntime(db, { resolveBusinessDay: getBusinessDay });
  return summary;
}

export function flowCoreSpikeHealth(): {
  enabled: boolean;
  businessDay: string;
  visitCount: number;
  catalogLoaded: boolean;
} {
  const runtime = getFlowCoreSpikeRuntime();
  const catalog = runtime.catalog();
  return {
    enabled: isFlowCoreSpikeEnabled(),
    businessDay: getBusinessDay(),
    visitCount: runtime.visits().length,
    catalogLoaded: catalog.topics.length > 0,
  };
}
