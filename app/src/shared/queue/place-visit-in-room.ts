import type { DatabaseSync } from 'node:sqlite';
import type { Runtime } from '@praxis-flow/flow-core/server';
import type { OpsSettings, QueueDisplayStatus, QueueVisitRow } from '../db/db-types.js';
import { domainError } from '../errors/domain-error.js';
import {
  arriveVisit,
  callVisit,
  continueJourneyVisit,
  reassignVisitRoom,
  visitStatusToQueueDisplayStatus,
} from '../flow-core/visit-queue-bridge.js';
import { assertRoomHasCapacity } from '../ops/room-capacity.js';
import { resolveCallRoomForVisit } from './resolve-call-room.js';

export type PlacementTransition = {
  fromStatus: QueueDisplayStatus;
  toStatus: QueueDisplayStatus;
  roomId: string;
  roomLabel: string;
};

/**
 * Host workflow for an explicit placement in a configured practice room.
 * The caller owns the outer SQLite transaction; the composed Core transitions
 * retain their individual audit events while this function reports one user action.
 */
export function placeVisitInRoom(input: {
  db: DatabaseSync;
  runtime: Runtime;
  settings: OpsSettings;
  listQueue: () => QueueVisitRow[];
  visitId: string;
  roomId: string;
  roomLabel?: string;
  actingRoomId?: string;
  actorId?: string;
}): PlacementTransition {
  const initialVisit = requireUpdatedVisit(input.runtime, input.visitId);
  const fromStatus = visitStatusToQueueDisplayStatus(initialVisit.status);
  const room = resolveCallRoomForVisit(input.settings, input.roomId, input.roomLabel);
  if (!room) {
    throw domainError('ROOM_REQUIRED');
  }

  // Validate before the first Core event, including when the requested target is
  // already stored on the visit. Capacity excludes this visit during a move.
  assertRoomHasCapacity(input.settings, input.listQueue(), room.roomId, input.visitId);

  let visit = initialVisit;
  if (visit.journeyStepCompletedAt) {
    continueJourneyVisit(
      input.runtime,
      input.settings,
      input.listQueue,
      input.visitId,
      room.roomId,
      input.actorId,
    );
    visit = requireUpdatedVisit(input.runtime, input.visitId);
  }

  if (visit.status === 'waiting' && visit.movementMode === 'call') {
    callVisit(
      input.db,
      input.runtime,
      input.settings,
      input.listQueue,
      input.visitId,
      room.roomId,
      room.roomLabel,
      input.actorId,
    );
    visit = requireUpdatedVisit(input.runtime, input.visitId);
  } else if (visit.targetLocationId !== room.roomId) {
    reassignVisitRoom(
      input.db,
      input.runtime,
      input.settings,
      input.listQueue,
      input.visitId,
      room.roomId,
      room.roomLabel,
      input.actorId,
    );
    visit = requireUpdatedVisit(input.runtime, input.visitId);
  }

  // H7 can finish the placement while starting the next Journey hop.
  if (visit.status !== 'arrived') {
    arriveVisit(input.db, input.runtime, input.visitId, input.actingRoomId, input.actorId);
    visit = requireUpdatedVisit(input.runtime, input.visitId);
  }

  return {
    fromStatus,
    toStatus: visitStatusToQueueDisplayStatus(visit.status),
    roomId: room.roomId,
    roomLabel: room.roomLabel,
  };
}

function requireUpdatedVisit(runtime: Runtime, visitId: string) {
  const visit = runtime.visits().find((entry) => entry.id === visitId);
  if (!visit) {
    throw domainError('VISIT_NOT_FOUND');
  }
  return visit;
}
