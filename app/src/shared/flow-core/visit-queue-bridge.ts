import type { DatabaseSync } from 'node:sqlite';
import type { Runtime } from '@praxis-flow/flow-core/server';
import { addEvent, updateVisit } from '@praxis-flow/flow-core/server';
import type { TransitionAction, Visit, VisitView, VisitStatus } from '@praxis-flow/flow-core';
import type { OpsSettings, QueueTicketRow, TicketStatus } from '../db/db-types.js';
import { DomainError, domainError } from '../errors/domain-error.js';
import { QUEUE_ROOM_MISMATCH } from '../queue/queue-room-scope.js';
import { resolveCallRoomForTicket } from '../queue/resolve-call-room.js';
import { assertRoomHasCapacity } from '../ops/room-capacity.js';
import { resolveDestinationRoomLabelForTopic, resolveTopicLabelFromSettings } from '../checkin-topic-settings.js';

const VISIT_QUEUE_STATUSES = new Set<VisitStatus>([
  'waiting',
  'directed',
  'called',
  'arrived',
  'in_progress',
  'blocked',
]);

const ROOM_ASSIGNED_VISIT_STATUSES = new Set<VisitStatus>(['called', 'arrived', 'in_progress']);

const INVALID_TRANSITION_CORE_CODES = new Set([
  'CALL_ONLY_FROM_WAITING',
  'CALL_ONLY_FOR_CALL_MOVEMENT',
  'ARRIVE_ONLY_WHEN_CALLED',
  'ARRIVE_ONLY_WHEN_DIRECTED',
  'ARRIVE_ONLY_WHEN_WAITING',
  'ARRIVE_NOT_ALLOWED',
  'START_ONLY_WHEN_ARRIVED',
  'DONE_ONLY_WHEN_IN_PROGRESS',
  'RETURN_TO_WAITING_NOT_ALLOWED',
  'UNKNOWN_ACTION',
]);

export function visitExistsInDb(db: DatabaseSync, visitId: string): boolean {
  const row = db.prepare('SELECT 1 AS exists_flag FROM visits WHERE id = ? LIMIT 1').get(visitId) as
    | { exists_flag?: number }
    | undefined;
  return row?.exists_flag === 1;
}

export function visitStatusToTicketStatus(status: VisitStatus): TicketStatus {
  if (status === 'called') return 'called';
  if (status === 'arrived' || status === 'in_progress') return 'in_room';
  if (status === 'waiting' || status === 'directed' || status === 'blocked') return 'waiting';
  if (status === 'done') return 'done';
  throw domainError('INVALID_TRANSITION');
}

export function mapFlowCoreTransitionError(error: unknown): never {
  if (error instanceof DomainError) {
    throw error;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message === 'VISIT_NOT_FOUND') {
    throw domainError('TICKET_NOT_FOUND');
  }
  if (message === 'VISIT_LOCATION_MISMATCH') {
    throw domainError(QUEUE_ROOM_MISMATCH);
  }
  if (INVALID_TRANSITION_CORE_CODES.has(message)) {
    throw domainError('INVALID_TRANSITION');
  }
  throw error instanceof Error ? error : domainError('INVALID_TRANSITION');
}

function resolveLocationLabel(settings: OpsSettings, locationId: string | null | undefined): string | null {
  if (!locationId) return null;
  const room = settings.rooms.find((entry) => entry.roomId === locationId);
  if (room) return room.roomLabel;
  if (locationId === 'pf_waiting') return 'Wartezimmer';
  if (locationId === 'pf_entrance') return 'Eingang';
  return locationId;
}

function requireVisit(runtime: Runtime, visitId: string): VisitView {
  const visit = runtime.visits().find((entry) => entry.id === visitId);
  if (!visit) {
    throw domainError('TICKET_NOT_FOUND');
  }
  return visit;
}

function runVisitTransition(
  runtime: Runtime,
  visitId: string,
  action: TransitionAction,
  context: { actingLocationId?: string; targetLocationId?: string } = {},
): VisitView {
  try {
    const updated = runtime.transition(visitId, action, context);
    if (!updated) {
      throw domainError('TICKET_NOT_FOUND');
    }
    return updated;
  } catch (error) {
    mapFlowCoreTransitionError(error);
  }
}

export function visitToQueueTicketRow(visit: VisitView, settings: OpsSettings): QueueTicketRow {
  const topicId = visit.primaryTopicId ?? 'unknown';
  const destinationRoomId = visit.targetLocationId ?? '';
  const destinationRoomLabel =
    visit.targetLocation?.publicName ??
    visit.targetLocation?.name ??
    resolveDestinationRoomLabelForTopic(settings, topicId) ??
    '';
  const assignedRoomId = ROOM_ASSIGNED_VISIT_STATUSES.has(visit.status)
    ? visit.targetLocationId ?? null
    : null;

  return {
    id: visit.id,
    laneCode: visit.queueLaneCode,
    number: visit.queueSequence,
    topicId,
    topicLabel: visit.topic?.name ?? resolveTopicLabelFromSettings(settings, topicId),
    destinationRoomId,
    destinationRoomLabel,
    status: visitStatusToTicketStatus(visit.status),
    createdAt: visit.checkedInAt ?? visit.createdAt,
    calledAt: visit.calledAt ?? null,
    identityRef: visit.patientDisplayName ?? null,
    checkinPhone: null,
    roomId: assignedRoomId,
    roomLabel: assignedRoomId ? resolveLocationLabel(settings, assignedRoomId) : null,
    callbackPhone: null,
    recallNotifyErrorCode: null,
    recallNotifySent: false,
    returnUntil: null,
    triageLevel: null,
    documentCount: 0,
    needsAssistance: visit.needsAssistance,
  };
}

export function listVisitQueueRows(
  runtime: Runtime,
  settings: OpsSettings,
  businessDay: string,
): QueueTicketRow[] {
  return runtime
    .visits()
    .filter((visit) => visit.queueNumberDate === businessDay)
    .filter((visit) => VISIT_QUEUE_STATUSES.has(visit.status))
    .map((visit) => visitToQueueTicketRow(visit, settings))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function callVisitTicket(
  runtime: Runtime,
  settings: OpsSettings,
  listQueue: () => QueueTicketRow[],
  visitId: string,
  roomId?: string,
  roomLabel?: string,
): { fromStatus: TicketStatus; toStatus: TicketStatus } {
  const visit = requireVisit(runtime, visitId);
  if (visit.status !== 'waiting' && visit.status !== 'directed') {
    throw domainError('INVALID_TRANSITION');
  }

  const queueRow = visitToQueueTicketRow(visit, settings);
  const resolvedRoom = resolveCallRoomForTicket(settings, roomId, roomLabel, {
    roomId: queueRow.destinationRoomId,
    roomLabel: queueRow.destinationRoomLabel,
  });
  if (resolvedRoom?.roomId) {
    assertRoomHasCapacity(settings, listQueue(), resolvedRoom.roomId);
  }

  const fromStatus = visitStatusToTicketStatus(visit.status);
  runVisitTransition(runtime, visitId, 'call', {
    targetLocationId: resolvedRoom?.roomId ?? visit.targetLocationId ?? undefined,
  });

  return { fromStatus, toStatus: 'called' };
}

export function arriveVisitTicket(
  runtime: Runtime,
  visitId: string,
  actingLocationId?: string,
): { fromStatus: TicketStatus; toStatus: TicketStatus } {
  const visit = requireVisit(runtime, visitId);
  if (visit.status !== 'called') {
    throw domainError('INVALID_TRANSITION');
  }

  const fromStatus = visitStatusToTicketStatus(visit.status);
  runVisitTransition(runtime, visitId, 'arrive', { actingLocationId });
  return { fromStatus, toStatus: 'in_room' };
}

export function startVisitTicket(
  runtime: Runtime,
  visitId: string,
  actingLocationId?: string,
): { fromStatus: TicketStatus; toStatus: TicketStatus } {
  const visit = requireVisit(runtime, visitId);
  if (visit.status !== 'arrived') {
    throw domainError('INVALID_TRANSITION');
  }

  const fromStatus = visitStatusToTicketStatus(visit.status);
  runVisitTransition(runtime, visitId, 'start', { actingLocationId });
  return { fromStatus, toStatus: 'in_room' };
}

export function doneVisitTicket(
  runtime: Runtime,
  visitId: string,
  actingLocationId?: string,
): { fromStatus: TicketStatus; toStatus: TicketStatus } {
  const visit = requireVisit(runtime, visitId);
  if (visit.status !== 'arrived' && visit.status !== 'in_progress') {
    throw domainError('INVALID_TRANSITION');
  }

  const fromStatus = visitStatusToTicketStatus(visit.status);
  if (!actingLocationId && visit.status === 'arrived') {
    runVisitTransition(runtime, visitId, 'start', {});
  }
  runVisitTransition(runtime, visitId, 'done', { actingLocationId });
  return { fromStatus, toStatus: 'done' };
}

/**
 * MFA zieht Patient aus grüner Zone zurück ins Wartezimmer (Core: return_to_waiting).
 * Nur called/arrived/in_progress — absent_* hat keinen Visit-Status und bleibt auf returnToWaitingInDb.
 */
export function returnToWaitingVisitTicket(
  runtime: Runtime,
  visitId: string,
): { fromStatus: TicketStatus; toStatus: TicketStatus } {
  const visit = requireVisit(runtime, visitId);
  if (!['called', 'arrived', 'in_progress'].includes(visit.status)) {
    throw domainError('INVALID_TRANSITION');
  }

  const fromStatus = visitStatusToTicketStatus(visit.status);
  runVisitTransition(runtime, visitId, 'return_to_waiting');
  return { fromStatus, toStatus: 'waiting' };
}

export function reassignVisitTicket(
  db: DatabaseSync,
  runtime: Runtime,
  settings: OpsSettings,
  listQueue: () => QueueTicketRow[],
  visitId: string,
  roomId?: string,
  roomLabel?: string,
): { fromStatus: TicketStatus; toStatus: TicketStatus } {
  const visitView = requireVisit(runtime, visitId);
  if (!['called', 'arrived', 'in_progress'].includes(visitView.status)) {
    throw domainError('INVALID_TRANSITION');
  }

  const fromStatus = visitStatusToTicketStatus(visitView.status);
  const queueRow = visitToQueueTicketRow(visitView, settings);
  const resolvedRoom = resolveCallRoomForTicket(settings, roomId, roomLabel, {
    roomId: queueRow.destinationRoomId,
    roomLabel: queueRow.destinationRoomLabel,
  });
  if (!resolvedRoom) {
    throw domainError('ROOM_REQUIRED');
  }

  const currentRoomId = visitView.targetLocationId ?? null;
  const roomChanged = resolvedRoom.roomId !== currentRoomId;
  if (roomChanged) {
    assertRoomHasCapacity(settings, listQueue(), resolvedRoom.roomId, visitId);
  }

  let toStatus: TicketStatus = fromStatus;
  const patch: Partial<Visit> = {
    targetLocationId: resolvedRoom.roomId,
  };
  if (fromStatus === 'in_room' && roomChanged) {
    patch.status = 'called';
    patch.arrivedAt = undefined;
    patch.startedAt = undefined;
    toStatus = 'called';
  }

  const visit = visitView as Visit;
  updateVisit(db, visit, patch);
  addEvent(
    db,
    visitId,
    'redirected',
    visit.status,
    patch.status ?? visit.status,
    visit.targetLocationId,
    resolvedRoom.roomId,
    visit.queueId,
    visit.queueId,
    'mfa',
  );

  return { fromStatus, toStatus };
}
