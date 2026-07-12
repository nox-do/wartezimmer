import { explainVisibility } from '@praxis-flow/flow-core';
import type { Runtime } from '@praxis-flow/flow-core/server';
import type { VisitView } from '@praxis-flow/flow-core';
import type {
  QueueVisitRow,
  RoomPanelMode,
  RoomPanelPlacement,
  RoomPanelTextPreset,
} from '../db/db-types.js';
import type { CoreDatabase } from '../db/database.js';
import type { RoomPanelSession } from '../../auth/staff-session-auth.js';
import { getBusinessDay } from '../db/database-time.js';
import { emptyFlowCoreRuntimeForMocks } from '../flow-core/test-runtime-mocks.js';
import { getFlowCoreRuntime } from '../flow-core/flow-core-runtime.js';
import { panelFlowSurfaceId } from '../flow-core/sync-catalog-from-ops-settings.js';
import { visitToQueueVisitRow } from '../flow-core/visit-queue-bridge.js';
import { isQueueCallAnnouncementReachable } from './call-announcement-guard.js';
import { resolveRoomPanelForSession } from '../room-panel/room-panel-policy.js';
import {
  isRoomPanelCallCandidateVisit,
  resolveRoomPanelCallCandidateActions,
  resolveRoomPanelItemActions,
  resolveRoomPanelSnapshotPolicy,
  type RoomPanelItemActions,
} from '../room-panel/room-panel-snapshot-policy.js';

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
  capabilities: {
    requiresPin: boolean;
    canCheckIn: boolean;
    canCheckOut: boolean;
    mayShowPatientNames: boolean;
    canCall: boolean;
    callAnnouncementReachable: boolean;
  };
  panel: {
    placement: RoomPanelPlacement;
    mode: RoomPanelMode;
    showPatientNames: boolean;
    calledText: string;
    arrivedText: string;
  };
  items: Array<{
    visitId: string;
    laneCode: string;
    number: number;
    status: 'called' | 'in_room' | 'directed';
    calledAt?: string;
    roomId: string;
    roomLabel: string;
    identityRef?: string | null;
    actions: RoomPanelItemActions;
  }>;
  callCandidates?: Array<{
    visitId: string;
    laneCode: string;
    number: number;
    status: 'waiting' | 'directed';
    roomId: string;
    roomLabel: string;
    identityRef?: string | null;
    actions: RoomPanelItemActions;
  }>;
  serverTime: string;
};

type RoomPanelItem = RoomPanelQueueSnapshot['items'][number];
type RoomPanelCallCandidate = NonNullable<RoomPanelQueueSnapshot['callCandidates']>[number];

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

function roomPanelCallSortMs(item: Pick<QueueVisitRow, 'calledAt' | 'createdAt'>): number {
  const calledMs = item.calledAt ? Date.parse(item.calledAt) : Number.NaN;
  if (!Number.isNaN(calledMs)) {
    return calledMs;
  }
  return Date.parse(item.createdAt);
}

/** Oldest room call first; falls back to check-in time when calledAt is missing. */
export function compareRoomPanelCallOrder(
  left: Pick<QueueVisitRow, 'calledAt' | 'createdAt'>,
  right: Pick<QueueVisitRow, 'calledAt' | 'createdAt'>,
): number {
  const byCall = roomPanelCallSortMs(left) - roomPanelCallSortMs(right);
  if (byCall !== 0) {
    return byCall;
  }
  return Date.parse(left.createdAt) - Date.parse(right.createdAt);
}

function compareRoomPanelCallCandidateOrder(left: QueueVisitRow, right: QueueVisitRow): number {
  return Date.parse(left.createdAt) - Date.parse(right.createdAt);
}

function isRoomPanelStatus(status: string): status is 'called' | 'in_room' | 'directed' {
  return status === 'called' || status === 'in_room' || status === 'directed';
}

function mapQueueRowToPanelItem(
  row: QueueVisitRow,
  sessionRoomId: string,
  fallbackRoomLabel: string,
  showPatientNames: boolean,
  actions: RoomPanelItemActions,
): RoomPanelItem | null {
  if (!isRoomPanelStatus(row.status)) {
    return null;
  }
  const panelRoomId =
    row.status === 'directed' ? row.destinationRoomId || null : row.roomId;
  if (panelRoomId !== sessionRoomId) {
    return null;
  }
  return {
    visitId: row.id,
    laneCode: row.laneCode,
    number: row.number,
    status: row.status,
    ...(row.calledAt ? { calledAt: row.calledAt } : {}),
    roomId: sessionRoomId,
    roomLabel: row.roomLabel?.trim() || row.destinationRoomLabel?.trim() || fallbackRoomLabel,
    ...(showPatientNames ? { identityRef: row.identityRef?.trim() || null } : {}),
    actions,
  };
}

function mapQueueRowToCallCandidate(
  row: QueueVisitRow,
  sessionRoomId: string,
  fallbackRoomLabel: string,
  showPatientNames: boolean,
  actions: RoomPanelItemActions,
): RoomPanelCallCandidate | null {
  return {
    visitId: row.id,
    laneCode: row.laneCode,
    number: row.number,
    status: row.status,
    roomId: sessionRoomId,
    roomLabel: row.destinationRoomLabel?.trim() || fallbackRoomLabel,
    ...(showPatientNames ? { identityRef: row.identityRef?.trim() || null } : {}),
    actions,
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
  const { room, placement, panel } = active;
  const snapshotPolicy = resolveRoomPanelSnapshotPolicy(active);
  const { capabilities } = snapshotPolicy;
  const settings = db.getOpsSettings();
  const roomLabel = room.roomLabel;
  const showPatientNames = capabilities.mayShowPatientNames;

  const catalog = runtime.catalog();
  const surfaceId = panelFlowSurfaceId(session.roomId);
  const surface = catalog.surfaces.find((entry) => entry.id === surfaceId);
  const rules = catalog.surfaceDisplayRules.filter((rule) => rule.surfaceId === surfaceId);

  const businessDayVisits = runtime
    .visits()
    .filter((visit) => visit.queueNumberDate === businessDay);

  const scored: Array<{
    item: RoomPanelItem;
    sortRow: Pick<QueueVisitRow, 'calledAt' | 'createdAt'>;
  }> = [];
  const callCandidateRows: QueueVisitRow[] = [];

  for (const visit of businessDayVisits) {
    const row = visitToQueueVisitRow(visit, settings);

    if (capabilities.canCall && isRoomPanelCallCandidateVisit(visit, row, session.roomId)) {
      callCandidateRows.push(row);
    }

    const explanation = explainVisibility(visit, surface, rules);
    if (!explanation.visible || !isRoomPanelStatus(row.status)) continue;

    const item = mapQueueRowToPanelItem(
      row,
      session.roomId,
      roomLabel,
      showPatientNames,
      resolveRoomPanelItemActions(row.status, capabilities),
    );
    if (item) {
      scored.push({ item, sortRow: row });
    }
  }

  scored.sort((left, right) => compareRoomPanelCallOrder(left.sortRow, right.sortRow));

  const snapshot: RoomPanelQueueSnapshot = {
    revision,
    view: 'room-panel',
    roomId: session.roomId,
    roomLabel,
    capabilities: {
      ...capabilities,
      callAnnouncementReachable: isQueueCallAnnouncementReachable(),
    },
    panel: {
      placement,
      mode: panel.mode,
      showPatientNames,
      calledText: panelText(panel.calledTextPreset, panel.calledTextCustom, 'please_enter'),
      arrivedText: panelText(panel.arrivedTextPreset, panel.arrivedTextCustom, 'please_wait_here'),
    },
    items: scored.map((entry) => entry.item),
    serverTime: new Date().toISOString(),
  };

  if (capabilities.canCall) {
    const itemVisitIds = new Set(scored.map((entry) => entry.item.visitId));
    callCandidateRows.sort(compareRoomPanelCallCandidateOrder);
    const candidateActions = resolveRoomPanelCallCandidateActions(capabilities);
    snapshot.callCandidates = callCandidateRows
      .map((row) =>
        mapQueueRowToCallCandidate(row, session.roomId, roomLabel, showPatientNames, candidateActions),
      )
      .filter((entry): entry is RoomPanelCallCandidate => entry !== null)
      .filter((entry) => !itemVisitIds.has(entry.visitId));
  }

  return snapshot;
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
