import type { DatabaseSync } from 'node:sqlite';
import type { Runtime } from '@praxis-flow/flow-core/server';
import { addEvent, updateVisit } from '@praxis-flow/flow-core/server';
import type { TransitionAction, Visit, VisitView, VisitStatus } from '@praxis-flow/flow-core';
import type {
  AbsenceMode,
  OpsSettings,
  QueueVisitRow,
  QueueDisplayStatus,
} from '../db/db-types.js';
import {
  absentModeToQueueDisplayStatus,
  applyVisitRecall,
  clearAbsentMode,
  clearVisitCallbackPhone as clearVisitCallbackPhoneInHostState,
  countPendingDocumentsByVisitIds,
  cycleVisitTriage,
  getVisitHostState,
  isVisitRecallWindowExpired,
  listVisitHostStatesForBusinessDay,
  setVisitAbsentMode,
  setVisitCallbackPhone as setVisitCallbackPhoneInHostState,
  setVisitIdentityRefOverride,
  type VisitHostStateRow,
} from '../db/visit-host-state.js';
import { DomainError, domainError } from '../errors/domain-error.js';
import { QUEUE_ROOM_MISMATCH } from '../queue/queue-room-scope.js';
import { resolveCallRoomForVisit } from '../queue/resolve-call-room.js';
import { resolveRecallNotifyPhone } from '../queue/recall-notify-phone.js';
import { assertRoomHasCapacity } from '../ops/room-capacity.js';
import {
  resolveCheckInDestinationRoomLabel,
  resolveTopicLabelFromSettings,
} from '../checkin-topic-settings.js';

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
  'START_NEXT_JOURNEY_STEP_NOT_ALLOWED',
  'UNKNOWN_ACTION',
  'SUPERSEDE_SOURCE_TERMINAL',
  'SUPERSEDE_ALREADY_SUPERSEDED',
  'SUPERSEDE_SAME_TOPIC',
  'SUPERSEDE_TOPIC_REQUIRED',
  'TOPIC_OR_ROUTING_RULE_MISSING',
  'TOPIC_NOT_ALLOWED_AT_SURFACE',
  'TOPIC_NOT_ACTIVE',
]);

export function visitExistsInDb(db: DatabaseSync, visitId: string): boolean {
  const row = db
    .prepare('SELECT 1 AS exists_flag FROM visits WHERE id = ? LIMIT 1')
    .get(visitId) as { exists_flag?: number } | undefined;
  return row?.exists_flag === 1;
}

export function requireVisitExistsInDb(db: DatabaseSync, visitId: string): void {
  if (!visitExistsInDb(db, visitId)) {
    throw domainError('VISIT_NOT_FOUND');
  }
}

export function visitStatusToQueueDisplayStatus(status: VisitStatus): QueueDisplayStatus {
  if (status === 'called') return 'called';
  if (status === 'arrived' || status === 'in_progress') return 'in_room';
  if (status === 'directed') return 'directed';
  if (status === 'waiting' || status === 'blocked') return 'waiting';
  if (status === 'done') return 'done';
  if (status === 'cancelled' || status === 'no_show') return 'cancelled';
  throw domainError('INVALID_TRANSITION');
}

export function mapFlowCoreTransitionError(error: unknown): never {
  if (error instanceof DomainError) {
    throw error;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message === 'VISIT_NOT_FOUND') {
    throw domainError('VISIT_NOT_FOUND');
  }
  if (message === 'VISIT_LOCATION_MISMATCH') {
    throw domainError(QUEUE_ROOM_MISMATCH);
  }
  if (INVALID_TRANSITION_CORE_CODES.has(message)) {
    throw domainError('INVALID_TRANSITION');
  }
  throw error instanceof Error ? error : domainError('INVALID_TRANSITION');
}

function resolveLocationLabel(
  settings: OpsSettings,
  locationId: string | null | undefined,
): string | null {
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
    throw domainError('VISIT_NOT_FOUND');
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
      throw domainError('VISIT_NOT_FOUND');
    }
    return updated;
  } catch (error) {
    mapFlowCoreTransitionError(error);
  }
}

function resolveEffectiveQueueDisplayStatus(
  visit: VisitView,
  hostState: VisitHostStateRow | null | undefined,
): QueueDisplayStatus {
  if (hostState?.absentMode) {
    return absentModeToQueueDisplayStatus(hostState.absentMode);
  }
  return visitStatusToQueueDisplayStatus(visit.status);
}

export function visitToQueueVisitRow(
  visit: VisitView,
  settings: OpsSettings,
  hostState?: VisitHostStateRow | null,
  documentCount = 0,
): QueueVisitRow {
  const topicId = visit.primaryTopicId ?? 'unknown';
  const destinationRoomId = visit.targetLocationId ?? '';
  const destinationRoomLabel = resolveCheckInDestinationRoomLabel(visit.targetLocation) ?? '';
  const hasAbsentOverlay = Boolean(hostState?.absentMode);
  const assignedRoomId =
    !hasAbsentOverlay && ROOM_ASSIGNED_VISIT_STATUSES.has(visit.status)
      ? (visit.targetLocationId ?? null)
      : null;

  return {
    id: visit.id,
    laneCode: visit.queueLaneCode,
    number: visit.queueSequence,
    topicId,
    topicLabel: visit.topic?.name ?? resolveTopicLabelFromSettings(settings, topicId),
    destinationRoomId,
    destinationRoomLabel,
    status: resolveEffectiveQueueDisplayStatus(visit, hostState),
    createdAt: visit.checkedInAt ?? visit.createdAt,
    calledAt: visit.calledAt ?? null,
    identityRef: hostState?.identityRefOverride ?? visit.patientDisplayName ?? null,
    checkinPhone: hostState?.checkinPhone ?? null,
    roomId: assignedRoomId,
    roomLabel: assignedRoomId ? resolveLocationLabel(settings, assignedRoomId) : null,
    journeyStepCompletedAt: visit.journeyStepCompletedAt ?? null,
    startedAt: visit.startedAt ?? null,
    movementMode: visit.movementMode ?? null,
    callbackPhone: hostState?.callbackPhone ?? null,
    recallNotifyErrorCode: hostState?.recallNotifyErrorCode ?? null,
    recallNotifySent: hostState?.recallNotifySent ?? false,
    returnUntil: hostState?.returnUntil ?? null,
    triageLevel: hostState?.triageLevel ?? null,
    documentCount,
    needsAssistance: visit.needsAssistance,
  };
}

export function listVisitQueueRows(
  runtime: Runtime,
  settings: OpsSettings,
  businessDay: string,
  db?: DatabaseSync,
): QueueVisitRow[] {
  const visits = runtime
    .visits()
    .filter((visit) => visit.queueNumberDate === businessDay)
    .filter((visit) => VISIT_QUEUE_STATUSES.has(visit.status));

  const hostStates = db ? listVisitHostStatesForBusinessDay(db, businessDay) : new Map();
  const documentCounts = db
    ? countPendingDocumentsByVisitIds(
        db,
        visits.map((visit) => visit.id),
      )
    : new Map();

  return visits
    .map((visit) =>
      visitToQueueVisitRow(
        visit,
        settings,
        hostStates.get(visit.id),
        documentCounts.get(visit.id) ?? 0,
      ),
    )
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

const ABSENCE_ELIGIBLE_VISIT_STATUSES = new Set<VisitStatus>(['waiting', 'directed', 'called']);
const CALLBACK_PHONE_ELIGIBLE_STATUSES: QueueDisplayStatus[] = [
  'waiting',
  'directed',
  'called',
  'absent_wait_here',
  'absent_return_later',
];
const TRIAGE_ELIGIBLE_STATUSES: QueueDisplayStatus[] = [
  'waiting',
  'directed',
  'called',
  'in_room',
  'absent_wait_here',
  'absent_return_later',
];
const RECALL_ELIGIBLE_STATUSES: QueueDisplayStatus[] = ['absent_wait_here', 'absent_return_later'];

function requireVisitForQueueOp(runtime: Runtime, visitId: string): VisitView {
  const visit = runtime.visits().find((entry) => entry.id === visitId);
  if (!visit) {
    throw domainError('VISIT_NOT_FOUND');
  }
  return visit;
}

function assertEffectiveStatus(
  visit: VisitView,
  hostState: VisitHostStateRow | null,
  allowed: QueueDisplayStatus[],
): QueueDisplayStatus {
  const status = resolveEffectiveQueueDisplayStatus(visit, hostState);
  if (!allowed.includes(status)) {
    throw domainError('INVALID_TRANSITION');
  }
  return status;
}

/** Legacy blocked call/arrive/reassign when ticket status was absent_*; overlay keeps Core status. */
function assertNoAbsentHostOverlay(db: DatabaseSync, visitId: string): void {
  const hostState = getVisitHostState(db, visitId);
  if (hostState?.absentMode) {
    throw domainError('INVALID_TRANSITION');
  }
}

export function setVisitAbsent(
  db: DatabaseSync,
  runtime: Runtime,
  settings: OpsSettings,
  visitId: string,
  mode: AbsenceMode,
  updatedAt: string,
): { fromStatus: QueueDisplayStatus; toStatus: QueueDisplayStatus } {
  const visit = requireVisitForQueueOp(runtime, visitId);
  if (!ABSENCE_ELIGIBLE_VISIT_STATUSES.has(visit.status)) {
    throw domainError('INVALID_TRANSITION');
  }

  const hostState = getVisitHostState(db, visitId);
  const fromStatus = resolveEffectiveQueueDisplayStatus(visit, hostState);
  setVisitAbsentMode(db, visitId, mode, updatedAt);
  const toStatus = absentModeToQueueDisplayStatus(mode);
  return { fromStatus, toStatus };
}

export function recallVisit(
  db: DatabaseSync,
  runtime: Runtime,
  settings: OpsSettings,
  visitId: string,
  returnWindowMinutes: number,
  updatedAt: string,
): {
  fromStatus: QueueDisplayStatus;
  toStatus: QueueDisplayStatus;
  returnUntil: string;
  returnWindowMinutes: number;
  callbackPhone: string | null;
  checkinLocale: string | null;
} {
  const visit = requireVisitForQueueOp(runtime, visitId);
  const hostState = getVisitHostState(db, visitId);
  const fromStatus = assertEffectiveStatus(visit, hostState, RECALL_ELIGIBLE_STATUSES);
  const notifyPhone = resolveRecallNotifyPhone(hostState?.callbackPhone, hostState?.checkinPhone);

  const returnUntil = new Date(
    Date.parse(updatedAt) + returnWindowMinutes * 60 * 1000,
  ).toISOString();
  applyVisitRecall(db, visitId, returnUntil, updatedAt);

  return {
    fromStatus,
    toStatus: 'absent_return_later',
    returnUntil,
    returnWindowMinutes,
    callbackPhone: notifyPhone,
    checkinLocale: hostState?.checkinLocale?.trim() || null,
  };
}

export function setVisitCallbackPhone(
  db: DatabaseSync,
  runtime: Runtime,
  settings: OpsSettings,
  visitId: string,
  callbackPhone: string,
  updatedAt: string,
): { callbackPhone: string; updatedAt: string } {
  const visit = requireVisitForQueueOp(runtime, visitId);
  const hostState = getVisitHostState(db, visitId);
  assertEffectiveStatus(visit, hostState, CALLBACK_PHONE_ELIGIBLE_STATUSES);
  const canonical = setVisitCallbackPhoneInHostState(db, visitId, callbackPhone, updatedAt);
  return { callbackPhone: canonical, updatedAt };
}

export function clearVisitCallbackPhone(
  db: DatabaseSync,
  runtime: Runtime,
  settings: OpsSettings,
  visitId: string,
  updatedAt: string,
): { updatedAt: string } {
  const visit = requireVisitForQueueOp(runtime, visitId);
  const hostState = getVisitHostState(db, visitId);
  assertEffectiveStatus(visit, hostState, CALLBACK_PHONE_ELIGIBLE_STATUSES);
  clearVisitCallbackPhoneInHostState(db, visitId, updatedAt);
  return { updatedAt };
}

export function setVisitIdentityRef(
  db: DatabaseSync,
  runtime: Runtime,
  visitId: string,
  identityRef: string,
  updatedAt: string,
): { identityRef: string; updatedAt: string } {
  const visit = requireVisitForQueueOp(runtime, visitId);
  if (visit.status !== 'waiting' && visit.status !== 'directed' && visit.status !== 'blocked') {
    throw domainError('INVALID_TRANSITION');
  }
  const hostState = getVisitHostState(db, visitId);
  if (hostState?.identityRefOverride?.trim() || visit.patientDisplayName?.trim()) {
    throw domainError('INVALID_TRANSITION');
  }
  const trimmed = setVisitIdentityRefOverride(db, visitId, identityRef, updatedAt);
  return { identityRef: trimmed, updatedAt };
}

export function cycleVisitTriageLevel(
  db: DatabaseSync,
  runtime: Runtime,
  settings: OpsSettings,
  visitId: string,
  updatedAt: string,
): { triageLevel: TriageLevel | null; updatedAt: string } {
  const visit = requireVisitForQueueOp(runtime, visitId);
  const hostState = getVisitHostState(db, visitId);
  assertEffectiveStatus(visit, hostState, TRIAGE_ELIGIBLE_STATUSES);
  const triageLevel = cycleVisitTriage(db, visitId, hostState?.triageLevel, updatedAt);
  return { triageLevel, updatedAt };
}

export function processExpiredRecallWindowForVisit(
  db: DatabaseSync,
  runtime: Runtime,
  visitId: string,
  nowIso: string,
): { transitioned: boolean; fromStatus: QueueDisplayStatus; toStatus: QueueDisplayStatus } | null {
  const hostState = getVisitHostState(db, visitId);
  if (!hostState || !isVisitRecallWindowExpired(hostState, nowIso)) {
    return null;
  }

  const visit = runtime.visits().find((entry) => entry.id === visitId);
  if (!visit) {
    return null;
  }

  const fromStatus = absentModeToQueueDisplayStatus('return_later');
  clearAbsentMode(db, visitId, nowIso);
  const toStatus = visitStatusToQueueDisplayStatus(visit.status);
  return { transitioned: true, fromStatus, toStatus };
}

/**
 * Clears host absent overlay; Core visit status unchanged (waiting/called).
 * Recall-Notify-State bleibt erhalten — wie returnToWaitingInDb für absent_*.
 */
export function returnAbsentVisitToQueue(
  db: DatabaseSync,
  runtime: Runtime,
  visitId: string,
  updatedAt: string,
): { fromStatus: QueueDisplayStatus; toStatus: QueueDisplayStatus } | null {
  const hostState = getVisitHostState(db, visitId);
  if (!hostState?.absentMode) {
    return null;
  }

  const visit = requireVisitForQueueOp(runtime, visitId);
  const fromStatus = absentModeToQueueDisplayStatus(hostState.absentMode);
  clearAbsentMode(db, visitId, updatedAt);
  const toStatus = visitStatusToQueueDisplayStatus(visit.status);
  return { fromStatus, toStatus };
}

export function callVisit(
  db: DatabaseSync,
  runtime: Runtime,
  settings: OpsSettings,
  listQueue: () => QueueVisitRow[],
  visitId: string,
  roomId?: string,
  roomLabel?: string,
): { fromStatus: QueueDisplayStatus; toStatus: QueueDisplayStatus } {
  let visit = requireVisit(runtime, visitId);
  const fromStatus = visitStatusToQueueDisplayStatus(visit.status);
  const startedNextJourneyStep = Boolean(visit.journeyStepCompletedAt);
  if (startedNextJourneyStep) {
    visit = runVisitTransition(runtime, visitId, 'start_next_journey_step');
  }
  if (visit.status !== 'waiting' && visit.status !== 'directed') {
    throw domainError('INVALID_TRANSITION');
  }
  assertNoAbsentHostOverlay(db, visitId);

  const queueRow = visitToQueueVisitRow(visit, settings);
  const resolvedRoom = resolveCallRoomForVisit(
    settings,
    startedNextJourneyStep ? undefined : roomId,
    startedNextJourneyStep ? undefined : roomLabel,
    {
      roomId: queueRow.destinationRoomId,
      roomLabel: queueRow.destinationRoomLabel,
    },
  );
  if (resolvedRoom?.roomId) {
    assertRoomHasCapacity(settings, listQueue(), resolvedRoom.roomId);
  }

  runVisitTransition(runtime, visitId, 'call', {
    targetLocationId: resolvedRoom?.roomId ?? visit.targetLocationId ?? undefined,
  });

  return { fromStatus, toStatus: 'called' };
}

export function arriveVisit(
  db: DatabaseSync,
  runtime: Runtime,
  visitId: string,
  actingLocationId?: string,
): { fromStatus: QueueDisplayStatus; toStatus: QueueDisplayStatus } {
  const visit = requireVisit(runtime, visitId);
  if (visit.status !== 'called' && visit.status !== 'directed') {
    throw domainError('INVALID_TRANSITION');
  }
  assertNoAbsentHostOverlay(db, visitId);

  const fromStatus = visitStatusToQueueDisplayStatus(visit.status);
  runVisitTransition(runtime, visitId, 'arrive', { actingLocationId });
  return { fromStatus, toStatus: 'in_room' };
}

export function startVisit(
  runtime: Runtime,
  visitId: string,
  actingLocationId?: string,
): { fromStatus: QueueDisplayStatus; toStatus: QueueDisplayStatus } {
  const visit = requireVisit(runtime, visitId);
  if (visit.status !== 'arrived') {
    throw domainError('INVALID_TRANSITION');
  }

  const fromStatus = visitStatusToQueueDisplayStatus(visit.status);
  runVisitTransition(runtime, visitId, 'start', { actingLocationId });
  return { fromStatus, toStatus: 'in_room' };
}

export function continueJourneyVisit(
  runtime: Runtime,
  visitId: string,
): { fromStatus: QueueDisplayStatus; toStatus: QueueDisplayStatus } {
  const visit = requireVisit(runtime, visitId);
  if (!visit.journeyStepCompletedAt) {
    throw domainError('INVALID_TRANSITION');
  }

  const fromStatus = visitStatusToQueueDisplayStatus(visit.status);
  const after = runVisitTransition(runtime, visitId, 'start_next_journey_step');
  return { fromStatus, toStatus: visitStatusToQueueDisplayStatus(after.status) };
}

export function completeVisit(
  runtime: Runtime,
  visitId: string,
  actingLocationId?: string,
): { fromStatus: QueueDisplayStatus; toStatus: QueueDisplayStatus } {
  const visit = requireVisit(runtime, visitId);
  if (visit.status !== 'arrived' && visit.status !== 'in_progress') {
    throw domainError('INVALID_TRANSITION');
  }

  const fromStatus = visitStatusToQueueDisplayStatus(visit.status);
  if (!actingLocationId && visit.status === 'arrived') {
    runVisitTransition(runtime, visitId, 'start', {});
  }
  const afterDone = runVisitTransition(runtime, visitId, 'done', { actingLocationId });
  return { fromStatus, toStatus: visitStatusToQueueDisplayStatus(afterDone.status) };
}

const CANCELABLE_VISIT_STATUSES = new Set<VisitStatus>([
  'waiting',
  'directed',
  'called',
  'arrived',
  'in_progress',
  'blocked',
]);

/** MFA „Wartenummer löschen“ — Visit terminal `cancelled` (kein Hard-Delete). */
export function cancelVisit(
  db: DatabaseSync,
  runtime: Runtime,
  visitId: string,
): { fromStatus: QueueDisplayStatus; toStatus: QueueDisplayStatus } {
  const visitView = requireVisit(runtime, visitId);
  if (!CANCELABLE_VISIT_STATUSES.has(visitView.status)) {
    throw domainError('INVALID_TRANSITION');
  }

  const hostState = getVisitHostState(db, visitId);
  const fromStatus = resolveEffectiveQueueDisplayStatus(visitView, hostState);
  const now = new Date().toISOString();
  const visit = visitView as Visit;
  const patch: Partial<Visit> = {
    status: 'cancelled',
    finishedAt: now,
  };
  if (visit.journeyState === 'active' || visit.journeyStepIndex != null) {
    patch.journeyState = 'abandoned';
  }

  updateVisit(db, visit, patch);
  addEvent(
    db,
    visitId,
    'cancelled',
    visit.status,
    'cancelled',
    visit.lastKnownLocationId,
    visit.targetLocationId,
    visit.queueId,
    visit.queueId,
    'mfa',
    'Wartenummer gelöscht',
  );
  if (hostState?.absentMode) {
    clearAbsentMode(db, visitId, now);
  }

  return { fromStatus, toStatus: 'cancelled' };
}

/**
 * MFA zieht Patient aus grüner Zone zurück ins Wartezimmer (Core: return_to_waiting).
 * Nur called/arrived/in_progress — absent_* hat keinen Visit-Status und bleibt auf returnToWaitingInDb.
 */
export function returnVisitToWaiting(
  runtime: Runtime,
  visitId: string,
): { fromStatus: QueueDisplayStatus; toStatus: QueueDisplayStatus } {
  const visit = requireVisit(runtime, visitId);
  if (!['called', 'arrived', 'in_progress'].includes(visit.status)) {
    throw domainError('INVALID_TRANSITION');
  }

  const fromStatus = visitStatusToQueueDisplayStatus(visit.status);
  runVisitTransition(runtime, visitId, 'return_to_waiting');
  return { fromStatus, toStatus: 'waiting' };
}

export function reassignVisitRoom(
  db: DatabaseSync,
  runtime: Runtime,
  settings: OpsSettings,
  listQueue: () => QueueVisitRow[],
  visitId: string,
  roomId?: string,
  roomLabel?: string,
): { fromStatus: QueueDisplayStatus; toStatus: QueueDisplayStatus } {
  const visitView = requireVisit(runtime, visitId);
  if (!['called', 'arrived', 'in_progress'].includes(visitView.status)) {
    throw domainError('INVALID_TRANSITION');
  }
  assertNoAbsentHostOverlay(db, visitId);

  const fromStatus = visitStatusToQueueDisplayStatus(visitView.status);
  const queueRow = visitToQueueVisitRow(visitView, settings);
  const resolvedRoom = resolveCallRoomForVisit(settings, roomId, roomLabel, {
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

  let toStatus: QueueDisplayStatus = fromStatus;
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
