import type { VisitView } from '@wartezimmer/flow-core';
import type { RoomPanelCapabilities, RoomPanelPolicyInput } from '@wartezimmer/domain';
import { resolveRoomPanelCapabilities, visitTargetsRoom } from '@wartezimmer/domain';
import type { CoreDatabase } from '../db/database.js';
import { domainError } from '../errors/domain-error.js';
import { QUEUE_ROOM_MISMATCH } from '../queue/queue-room-scope.js';
import type { ActiveRoomPanel } from './room-panel-policy.js';

export type RoomPanelSnapshotPolicy = {
  activePanel: ActiveRoomPanel;
  policyInput: RoomPanelPolicyInput;
  capabilities: RoomPanelCapabilities;
};

export function resolveRoomPanelSnapshotPolicy(
  activePanel: ActiveRoomPanel,
): RoomPanelSnapshotPolicy {
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

export type RoomPanelCallCandidateScopeFailure =
  | 'VISIT_NOT_FOUND'
  | 'INVALID_TRANSITION'
  | 'ROOM_MISMATCH';

/** Shared scope check for snapshot callCandidates and transition guards. */
export function resolveRoomPanelCallCandidateScope(
  visit: Pick<VisitView, 'status' | 'movementMode' | 'targetLocationId'> | undefined,
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
  if (!visitTargetsRoom(visit, sessionRoomId)) {
    return 'ROOM_MISMATCH';
  }
  return null;
}

export function isRoomPanelCallCandidateVisit(
  visit: Pick<VisitView, 'status' | 'movementMode' | 'targetLocationId'>,
  sessionRoomId: string,
): boolean {
  return resolveRoomPanelCallCandidateScope(visit, sessionRoomId) === null;
}

/** Panel call may only confirm routing for visits already targeting the session room. */
export function assertRoomPanelCallVisitScope(
  db: Pick<CoreDatabase, 'getFlowCoreRuntimeInstance'>,
  visitId: string,
  sessionRoomId: string,
): void {
  const runtime = db.getFlowCoreRuntimeInstance();
  const visit = runtime.visits().find((entry) => entry.id === visitId);
  const failure = resolveRoomPanelCallCandidateScope(visit, sessionRoomId);
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
