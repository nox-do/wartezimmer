import { explainVisibility } from '@praxis-flow/flow-core';
import type { Runtime } from '@praxis-flow/flow-core/server';
import type { CoreDatabase } from '../db/database.js';
import type { OpsSettings } from '../db/db-types.js';
import { getBusinessDay } from '../db/database-time.js';
import { emptyFlowCoreRuntimeForMocks } from '../flow-core/test-runtime-mocks.js';
import { getFlowCoreRuntime } from '../flow-core/flow-core-runtime.js';
import { PF_FLOW_SURFACE_TV } from '../flow-core/sync-catalog-from-ops-settings.js';
import { visitToQueueVisitRow } from '../flow-core/visit-queue-bridge.js';

export type TvQueueSnapshot = {
  revision: number;
  view: 'tv';
  items: Array<{
    laneCode: string;
    number: number;
    status: string;
    roomLabel: string | null;
    movementMode: 'call' | 'self_go' | 'pickup' | null;
  }>;
  checkinLocked: boolean;
  serverTime: string;
};

type TvQueueItem = TvQueueSnapshot['items'][number];

export type BuildTvQueueSnapshotInput = {
  runtime: Runtime;
  settings: OpsSettings;
  businessDay: string;
  checkinLocked: boolean;
  revision: number;
};

function mapVisitToTvItem(
  visit: ReturnType<Runtime['visits']>[number],
  settings: OpsSettings,
): TvQueueItem {
  const row = visitToQueueVisitRow(visit, settings);
  const pickup = row.status === 'waiting' && row.movementMode === 'pickup';
  return {
    laneCode: row.laneCode,
    number: row.number,
    status: row.status,
    roomLabel: pickup ? row.destinationRoomLabel?.trim() || row.roomLabel : row.roomLabel,
    movementMode: row.movementMode,
  };
}

/** TV items from Visits via explainVisibility (Phase A — no legacy ticket fallback). */
export function buildTvQueueSnapshotFromFlowCore(
  input: BuildTvQueueSnapshotInput,
): TvQueueSnapshot {
  const { runtime, settings, businessDay, checkinLocked, revision } = input;
  const catalog = runtime.catalog();
  const surface = catalog.surfaces.find((entry) => entry.id === PF_FLOW_SURFACE_TV);
  const rules = catalog.surfaceDisplayRules.filter((rule) => rule.surfaceId === PF_FLOW_SURFACE_TV);

  const businessDayVisits = runtime
    .visits()
    .filter((visit) => visit.queueNumberDate === businessDay);

  const visibleItems: Array<{ item: TvQueueItem; createdAt: string }> = [];
  for (const visit of businessDayVisits) {
    const explanation = explainVisibility(visit, surface, rules);
    if (!explanation.visible) continue;
    visibleItems.push({
      item: mapVisitToTvItem(visit, settings),
      createdAt: visit.checkedInAt ?? visit.createdAt,
    });
  }
  visibleItems.sort((left, right) => left.createdAt.localeCompare(right.createdAt));

  return {
    revision,
    view: 'tv',
    items: visibleItems.map((entry) => entry.item),
    checkinLocked,
    serverTime: new Date().toISOString(),
  };
}

function resolveFlowCoreRuntime(db: CoreDatabase): Runtime {
  if (typeof db.getFlowCoreRuntimeInstance === 'function') {
    return db.getFlowCoreRuntimeInstance();
  }
  return emptyFlowCoreRuntimeForMocks();
}

export function buildTvQueueSnapshot(db: CoreDatabase, revision: number): TvQueueSnapshot {
  return buildTvQueueSnapshotFromFlowCore({
    runtime: resolveFlowCoreRuntime(db),
    settings: db.getOpsSettings(),
    businessDay: getBusinessDay(),
    checkinLocked: db.isCheckinLocked(),
    revision,
  });
}

/** @internal Exposed for tests that hold a raw sqlite handle without CoreDatabase. */
export function buildTvQueueSnapshotForSqlite(
  db: Parameters<typeof getFlowCoreRuntime>[0],
  settings: OpsSettings,
  checkinLocked: boolean,
  revision: number,
): TvQueueSnapshot {
  return buildTvQueueSnapshotFromFlowCore({
    runtime: getFlowCoreRuntime(db),
    settings,
    businessDay: getBusinessDay(),
    checkinLocked,
    revision,
  });
}
