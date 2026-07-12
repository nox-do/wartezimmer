import type { VisitView } from '@praxis-flow/flow-core';
import type { RoomPanelCapabilities, RoomPanelPolicyInput } from '@praxis-flow/domain';
import { resolveRoomPanelCapabilities, visitTargetsRoom } from '@praxis-flow/domain';
import type { CoreDatabase } from '../db/database.js';
import type { QueueVisitRow } from '../db/db-types.js';
import { domainError } from '../errors/domain-error.js';
import { visitToQueueVisitRow } from '../flow-core/visit-queue-bridge.js';
import { QUEUE_ROOM_MISMATCH } from '../queue/queue-room-scope.js';
import type { ActiveRoomPanel } from './room-panel-policy.js';

export type RoomPanelSnapshotPolicy = {
  activePanel: ActiveRoomPanel;
  policyInput: RoomPanelPolicyInput;
  capabilities: RoomPanelCapabilities;
};

export function resolveRoomPanelSnapshotPolicy(activePanel: ActiveRoomPanel): RoomPanelSnapshotPolicy {
  const policyInput: RoomPanelPolicyInput = {
    placement: activePanel.placement,
    ...activePanel.panel,
  };

  return {
    activePanel,
    policyInput,
    capabilities: resolveRoomPanelCapabilities(policyInput),
  };
}

export type RoomPanelItemActions = {
  canCall?: boolean;
  canArrive?: boolean;
  canCheckOut?: boolean;
};

export function resolveRoomPanelItemActions(
  status: 'called' | 'in_room' | 'directed',
  capabilities: RoomPanelCapabilities,
): RoomPanelItemActions {
  const actions: RoomPanelItemActions = {};
  if (capabilities.canCheckIn && (status === 'called' || status === 'directed')) {
    actions.canArrive = true;
  }
  if (capabilities.canCheckOut && status === 'in_room') {
    actions.canCheckOut = true;
  }
  return actions;
}

export function resolveRoomPanelCallCandidateActions(
  capabilities: RoomPanelCapabilities,
): RoomPanelItemActions {
  return capabilities.canCall ? { canCall: true } : {};
}

export function roomPanelCallVisitScopeInput(
  visit: Pick<VisitView, 'status' | 'movementMode' | 'targetLocationId'>,
  row: Pick<QueueVisitRow, 'destinationRoomId' | 'roomId'>,
) {
  return {
    status: visit.status,
    movementMode: visit.movementMode,
    destinationRoomId: row.destinationRoomId,
    targetLocationId: visit.targetLocationId,
    roomId: row.roomId,
  };
}

export type RoomPanelCallCandidateScopeFailure =
  | 'VISIT_NOT_FOUND'
  | 'INVALID_TRANSITION'
  | 'ROOM_MISMATCH';

/** Shared scope check for snapshot callCandidates and transition guards. */
export function resolveRoomPanelCallCandidateScope(
  visit: Pick<VisitView, 'status' | 'movementMode' | 'targetLocationId'> | undefined,
  row: Pick<QueueVisitRow, 'destinationRoomId' | 'roomId'> | null,
  sessionRoomId: string,
): RoomPanelCallCandidateScopeFailure | null {
  if (!visit) {
    return 'VISIT_NOT_FOUND';
  }
  if (visit.movementMode !== 'call') {
    return 'INVALID_TRANSITION';
  }
  if (visit.status !== 'waiting' && visit.status !== 'directed') {
    return 'INVALID_TRANSITION';
  }
  if (!row || !visitTargetsRoom(roomPanelCallVisitScopeInput(visit, row), sessionRoomId)) {
    return 'ROOM_MISMATCH';
  }
  return null;
}

export function isRoomPanelCallCandidateVisit(
  visit: Pick<VisitView, 'status' | 'movementMode' | 'targetLocationId'>,
  row: Pick<QueueVisitRow, 'destinationRoomId' | 'roomId'>,
  sessionRoomId: string,
): boolean {
  return resolveRoomPanelCallCandidateScope(visit, row, sessionRoomId) === null;
}

/** Panel call may only confirm routing for visits already targeting the session room. */
export function assertRoomPanelCallVisitScope(
  db: Pick<CoreDatabase, 'getOpsSettings' | 'getFlowCoreRuntimeInstance'>,
  visitId: string,
  sessionRoomId: string,
): void {
  const runtime = db.getFlowCoreRuntimeInstance();
  const visit = runtime.visits().find((entry) => entry.id === visitId);
  const row = visit ? visitToQueueVisitRow(visit, db.getOpsSettings()) : null;
  const failure = resolveRoomPanelCallCandidateScope(visit, row, sessionRoomId);
  switch (failure) {
    case 'VISIT_NOT_FOUND':
      throw domainError('VISIT_NOT_FOUND');
    case 'INVALID_TRANSITION':
      throw domainError('INVALID_TRANSITION');
    case 'ROOM_MISMATCH':
      throw domainError(QUEUE_ROOM_MISMATCH);
    case null:
      return;
  }
}
