import { explainVisibility } from '@praxis-flow/flow-core';
import type { Runtime } from '@praxis-flow/flow-core/server';
import type { CoreDatabase } from '../db/database.js';
import type { OpsSettings, QueueTicketRow } from '../db/db-types.js';
import { getBusinessDay } from '../db/database-time.js';
import { getFlowCoreRuntime } from '../flow-core/flow-core-runtime.js';
import { PF_FLOW_SURFACE_TV } from '../flow-core/sync-catalog-from-ops-settings.js';
import { visitToQueueTicketRow } from '../flow-core/visit-queue-bridge.js';

export type TvQueueSnapshot = {
  revision: number;
  view: 'tv';
  items: Array<{
    laneCode: string;
    number: number;
    status: string;
    roomLabel: string | null;
  }>;
  checkinLocked: boolean;
  serverTime: string;
};

type TvQueueItem = TvQueueSnapshot['items'][number];

export type BuildTvQueueSnapshotInput = {
  runtime: Runtime;
  settings: OpsSettings;
  businessDay: string;
  listQueue: () => QueueTicketRow[];
  checkinLocked: boolean;
  revision: number;
};

function mapVisitToTvItem(visit: ReturnType<Runtime['visits']>[number], settings: OpsSettings): TvQueueItem {
  const row = visitToQueueTicketRow(visit, settings);
  return {
    laneCode: row.laneCode,
    number: row.number,
    status: row.status,
    roomLabel: row.roomLabel,
  };
}

function mapLegacyTicketToTvItem(row: QueueTicketRow): TvQueueItem {
  return {
    laneCode: row.laneCode,
    number: row.number,
    status: row.status,
    roomLabel: row.roomLabel,
  };
}

/** TV items from Visits via explainVisibility; Legacy-Tickets ohne Visit-Zeile aus listQueue. */
export function buildTvQueueSnapshotFromFlowCore(input: BuildTvQueueSnapshotInput): TvQueueSnapshot {
  const { runtime, settings, businessDay, listQueue, checkinLocked, revision } = input;
  const catalog = runtime.catalog();
  const surface = catalog.surfaces.find((entry) => entry.id === PF_FLOW_SURFACE_TV);
  const rules = catalog.surfaceDisplayRules.filter((rule) => rule.surfaceId === PF_FLOW_SURFACE_TV);

  const businessDayVisits = runtime
    .visits()
    .filter((visit) => visit.queueNumberDate === businessDay);
  const visitIds = new Set(businessDayVisits.map((visit) => visit.id));

  const visibleVisitItemsById = new Map<string, TvQueueItem>();
  for (const visit of businessDayVisits) {
    const explanation = explainVisibility(visit, surface, rules);
    if (!explanation.visible) continue;
    visibleVisitItemsById.set(visit.id, mapVisitToTvItem(visit, settings));
  }

  // Legacy tickets (no visits row): unchanged mapping from listQueue until tickets table is removed.
  const items: TvQueueItem[] = [];
  for (const row of listQueue()) {
    if (visitIds.has(row.id)) {
      const visitItem = visibleVisitItemsById.get(row.id);
      if (visitItem) {
        items.push(visitItem);
      }
      continue;
    }
    items.push(mapLegacyTicketToTvItem(row));
  }

  return {
    revision,
    view: 'tv',
    items,
    checkinLocked,
    serverTime: new Date().toISOString(),
  };
}

function emptyFlowCoreRuntimeForMocks(): Runtime {
  return {
    catalog: () => ({ surfaces: [], surfaceDisplayRules: [] }),
    visits: () => [],
  } as unknown as Runtime;
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
    listQueue: () => db.listQueue(),
    checkinLocked: db.isCheckinLocked(),
    revision,
  });
}

/** @internal Exposed for tests that hold a raw sqlite handle without CoreDatabase. */
export function buildTvQueueSnapshotForSqlite(
  db: Parameters<typeof getFlowCoreRuntime>[0],
  settings: OpsSettings,
  listQueue: () => QueueTicketRow[],
  checkinLocked: boolean,
  revision: number,
): TvQueueSnapshot {
  return buildTvQueueSnapshotFromFlowCore({
    runtime: getFlowCoreRuntime(db),
    settings,
    businessDay: getBusinessDay(),
    listQueue,
    checkinLocked,
    revision,
  });
}
