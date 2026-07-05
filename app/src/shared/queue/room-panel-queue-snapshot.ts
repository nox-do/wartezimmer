import { explainVisibility } from '@praxis-flow/flow-core';
import type { Runtime } from '@praxis-flow/flow-core/server';
import type {
  QueueTicketRow,
  RoomPanelMode,
  RoomPanelSettings,
  RoomPanelTextPreset,
} from '../db/db-types.js';
import type { CoreDatabase } from '../db/database.js';
import type { RoomPanelSession } from '../../auth/staff-session-auth.js';
import { getBusinessDay } from '../db/database-time.js';
import { getFlowCoreRuntime } from '../flow-core/flow-core-runtime.js';
import { panelFlowSurfaceId } from '../flow-core/sync-catalog-from-ops-settings.js';
import { visitToQueueTicketRow } from '../flow-core/visit-queue-bridge.js';
import {
  resolveRoomPanelForSession,
  roomPanelMayShowPatientNames,
} from '../room-panel/room-panel-policy.js';

const PRESET_TEXT: Record<RoomPanelTextPreset, string> = {
  you_are_right: 'Sie sind hier richtig.',
  please_wait_here: 'Bitte hier warten.',
  please_enter: 'Bitte eintreten.',
  go_to_reception: 'Bitte wenden Sie sich an den Empfang.',
  custom: '',
};

export type RoomPanelQueueSnapshot = {
  revision: number;
  view: 'room-panel';
  roomId: string;
  roomLabel: string;
  panel: {
    placement: RoomPanelSettings['placement'];
    mode: RoomPanelMode;
    showPatientNames: boolean;
    calledText: string;
    arrivedText: string;
  };
  items: Array<{
    visitId: string;
    laneCode: string;
    number: number;
    status: 'called' | 'in_room';
    calledAt?: string;
    roomId: string;
    roomLabel: string;
    identityRef?: string | null;
  }>;
  serverTime: string;
};

type RoomPanelItem = RoomPanelQueueSnapshot['items'][number];

export type BuildRoomPanelQueueSnapshotInput = {
  db: CoreDatabase;
  runtime: Runtime;
  businessDay: string;
  revision: number;
  session: Pick<RoomPanelSession, 'roomId' | 'placement'>;
};

function panelText(
  preset: RoomPanelTextPreset,
  custom: string | null,
  fallbackPreset: RoomPanelTextPreset,
): string {
  return preset === 'custom' ? custom?.trim() || PRESET_TEXT[fallbackPreset] : PRESET_TEXT[preset];
}

function roomPanelCallSortMs(item: Pick<QueueTicketRow, 'calledAt' | 'createdAt'>): number {
  const calledMs = item.calledAt ? Date.parse(item.calledAt) : Number.NaN;
  if (!Number.isNaN(calledMs)) {
    return calledMs;
  }
  return Date.parse(item.createdAt);
}

/** Oldest room call first; falls back to check-in time when calledAt is missing. */
export function compareRoomPanelCallOrder(
  left: Pick<QueueTicketRow, 'calledAt' | 'createdAt'>,
  right: Pick<QueueTicketRow, 'calledAt' | 'createdAt'>,
): number {
  const byCall = roomPanelCallSortMs(left) - roomPanelCallSortMs(right);
  if (byCall !== 0) {
    return byCall;
  }
  return Date.parse(left.createdAt) - Date.parse(right.createdAt);
}

function isRoomPanelStatus(status: string): status is 'called' | 'in_room' {
  return status === 'called' || status === 'in_room';
}

function mapQueueRowToPanelItem(
  row: QueueTicketRow,
  sessionRoomId: string,
  fallbackRoomLabel: string,
  showPatientNames: boolean,
): RoomPanelItem | null {
  if (!isRoomPanelStatus(row.status) || row.roomId !== sessionRoomId) {
    return null;
  }
  return {
    visitId: row.id,
    laneCode: row.laneCode,
    number: row.number,
    status: row.status,
    ...(row.calledAt ? { calledAt: row.calledAt } : {}),
    roomId: sessionRoomId,
    roomLabel: row.roomLabel?.trim() || fallbackRoomLabel,
    ...(showPatientNames ? { identityRef: row.identityRef?.trim() || null } : {}),
  };
}

/** Room-panel items from Visits via explainVisibility (Phase A — no legacy ticket fallback). */
export function buildRoomPanelQueueSnapshotFromFlowCore(
  input: BuildRoomPanelQueueSnapshotInput,
): RoomPanelQueueSnapshot {
  const { db, runtime, businessDay, revision, session } = input;
  const active = resolveRoomPanelForSession(db, session);
  if (!active) {
    throw new Error('ROOM_PANEL_SESSION_INVALID');
  }
  const { room, panel } = active;
  const settings = db.getOpsSettings();
  const roomLabel = room.roomLabel;
  const showPatientNames = roomPanelMayShowPatientNames(panel);

  const catalog = runtime.catalog();
  const surfaceId = panelFlowSurfaceId(session.roomId);
  const surface = catalog.surfaces.find((entry) => entry.id === surfaceId);
  const rules = catalog.surfaceDisplayRules.filter((rule) => rule.surfaceId === surfaceId);

  const businessDayVisits = runtime
    .visits()
    .filter((visit) => visit.queueNumberDate === businessDay);

  const scored: Array<{
    item: RoomPanelItem;
    sortRow: Pick<QueueTicketRow, 'calledAt' | 'createdAt'>;
  }> = [];

  for (const visit of businessDayVisits) {
    const explanation = explainVisibility(visit, surface, rules);
    if (!explanation.visible) continue;
    const row = visitToQueueTicketRow(visit, settings);
    const item = mapQueueRowToPanelItem(row, session.roomId, roomLabel, showPatientNames);
    if (item) {
      scored.push({ item, sortRow: row });
    }
  }

  scored.sort((left, right) => compareRoomPanelCallOrder(left.sortRow, right.sortRow));

  return {
    revision,
    view: 'room-panel',
    roomId: session.roomId,
    roomLabel,
    panel: {
      placement: panel.placement,
      mode: panel.mode,
      showPatientNames,
      calledText: panelText(panel.calledTextPreset, panel.calledTextCustom, 'please_enter'),
      arrivedText: panelText(panel.arrivedTextPreset, panel.arrivedTextCustom, 'please_wait_here'),
    },
    items: scored.map((entry) => entry.item),
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

export function buildRoomPanelQueueSnapshot(
  db: CoreDatabase,
  revision: number,
  session: Pick<RoomPanelSession, 'roomId' | 'placement'>,
): RoomPanelQueueSnapshot {
  return buildRoomPanelQueueSnapshotFromFlowCore({
    db,
    runtime: resolveFlowCoreRuntime(db),
    businessDay: getBusinessDay(),
    revision,
    session,
  });
}

/** @internal For tests with a raw sqlite handle. */
export function buildRoomPanelQueueSnapshotForSqlite(
  db: CoreDatabase,
  sqlite: Parameters<typeof getFlowCoreRuntime>[0],
  revision: number,
  session: Pick<RoomPanelSession, 'roomId' | 'placement'>,
): RoomPanelQueueSnapshot {
  return buildRoomPanelQueueSnapshotFromFlowCore({
    db,
    runtime: getFlowCoreRuntime(sqlite),
    businessDay: getBusinessDay(),
    revision,
    session,
  });
}
