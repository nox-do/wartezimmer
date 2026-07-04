import type { StatementSync } from 'node:sqlite';
import { resolveCallRoomForTicket } from '../queue/resolve-call-room.js';
import { resolveRecallNotifyPhone } from '../queue/recall-notify-phone.js';
import { assertRoomHasCapacity } from '../ops/room-capacity.js';
import {
  isTicketStatus,
  type AbsenceMode,
  type OpsSettings,
  type QueueSummary,
  type QueueTicketRow,
  type TicketStatus,
} from './db-types.js';
import { domainError } from '../errors/domain-error.js';
import { assertQueueRoomScope } from '../queue/queue-room-scope.js';
import { cycleTriageLevel, type TriageLevel } from '../queue/queue-triage.js';
import { canonicalizePhone } from '../phone/canonicalize-phone.js';

type QueueStatements = {
  listQueueStmt: StatementSync;
  listExpiredRecallWindowsStmt: StatementSync;
  queueSummaryStmt: StatementSync;
  getTicketByIdStmt: StatementSync;
  getTicketDetailStmt: StatementSync;
  getTicketIdentityViewStmt: StatementSync;
  updateTicketCalledStmt: StatementSync;
  updateQueueCalledStmt: StatementSync;
  updateTicketStatusStmt: StatementSync;
  updateTicketIdentityRefStmt: StatementSync;
  updateQueueReturnUntilStmt: StatementSync;
  updateQueueCallbackPhoneStmt: StatementSync;
  updateQueueRecallNotifyErrorStmt: StatementSync;
  updateQueueRecallNotifySentStmt: StatementSync;
  updateQueueTriageLevelStmt: StatementSync;
  clearQueueRoomStmt: StatementSync;
};

type QueueHelpers = {
  nowIso: () => string;
  getBusinessDay: () => string;
  getReturnWindowMinutes: () => number;
  getOpsSettings: () => OpsSettings;
  emitOutboxEvent: (
    eventType: string,
    aggregateId: string,
    payload: Record<string, unknown>,
  ) => void;
};

export type QueueDeps = QueueStatements & QueueHelpers;

type StatusTransitionResult = { fromStatus: string; toStatus: string };

type QueueStatusTransitionInput = {
  ticketId: string;
  fromStatus: TicketStatus;
  toStatus: TicketStatus;
  updatedAt: string;
  useCalledUpdate?: boolean;
  setRoom?: boolean;
  roomId?: string | null;
  roomLabel?: string | null;
  clearRoom?: boolean;
  returnUntil?: string | null;
  callbackPhone?: string | null;
  absenceMode?: AbsenceMode;
};

function emitQueueStatusChanged(deps: QueueDeps, input: QueueStatusTransitionInput): void {
  const payload: Record<string, unknown> = {
    ticketId: input.ticketId,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    updatedAt: input.updatedAt,
  };
  if (input.roomId !== undefined || input.roomLabel !== undefined) {
    payload.roomId = input.roomId ?? null;
    payload.roomLabel = input.roomLabel ?? null;
  }
  if (input.returnUntil !== undefined) {
    payload.returnUntil = input.returnUntil;
  }
  if (input.absenceMode != null) {
    payload.absenceMode = input.absenceMode;
  }
  deps.emitOutboxEvent('QueueStatusChanged', input.ticketId, payload);
}

function applyQueueStatusTransition(deps: QueueDeps, input: QueueStatusTransitionInput): void {
  if (input.useCalledUpdate) {
    deps.updateTicketCalledStmt.run(input.toStatus, input.updatedAt, input.ticketId);
  } else {
    deps.updateTicketStatusStmt.run(input.toStatus, input.updatedAt, input.ticketId);
  }
  if (input.setRoom) {
    deps.updateQueueCalledStmt.run(
      input.updatedAt,
      input.roomId ?? null,
      input.roomLabel ?? null,
      input.ticketId,
    );
  }
  if (input.clearRoom) {
    deps.clearQueueRoomStmt.run(input.ticketId);
  }
  if (input.returnUntil !== undefined) {
    deps.updateQueueReturnUntilStmt.run(input.returnUntil, input.ticketId);
  }
  if (input.callbackPhone !== undefined) {
    deps.updateQueueCallbackPhoneStmt.run(input.callbackPhone, input.ticketId);
  }

  emitQueueStatusChanged(deps, input);
}

export function requireTicketFromDb(
  deps: Pick<QueueDeps, 'getTicketByIdStmt'>,
  ticketId: string,
): {
  id: string;
  status: TicketStatus;
  topicId: string;
  destinationRoomId: string;
  destinationRoomLabel: string;
} {
  const ticket = deps.getTicketByIdStmt.get(ticketId) as
    | {
        id?: string;
        status?: string;
        topicId?: string;
        destinationRoomId?: string;
        destinationRoomLabel?: string;
      }
    | undefined;
  if (!ticket?.id || !ticket.status || !ticket.topicId || !isTicketStatus(ticket.status)) {
    throw domainError('TICKET_NOT_FOUND');
  }

  const destinationRoomId = ticket.destinationRoomId?.trim();
  const destinationRoomLabel = ticket.destinationRoomLabel?.trim();
  if (!destinationRoomId || !destinationRoomLabel) {
    throw domainError('TICKET_NOT_FOUND');
  }

  return {
    id: ticket.id,
    status: ticket.status,
    topicId: ticket.topicId,
    destinationRoomId,
    destinationRoomLabel,
  };
}

function assertTransition(current: TicketStatus, allowed: TicketStatus[]): void {
  if (!allowed.includes(current)) {
    throw domainError('INVALID_TRANSITION');
  }
}

export function listQueueFromDb(deps: QueueDeps): QueueTicketRow[] {
  const rows = deps.listQueueStmt.all(deps.getBusinessDay()) as Array<
    Omit<QueueTicketRow, 'recallNotifySent'> & { recallNotifySent?: number | boolean }
  >;
  return rows.map((row) => ({
    ...row,
    recallNotifySent: Boolean(row.recallNotifySent),
  }));
}

function readRecallWindowTicket(
  deps: Pick<QueueDeps, 'getTicketDetailStmt'>,
  ticketId: string,
): { id: string; status: TicketStatus; returnUntil: string } | null {
  const ticket = deps.getTicketDetailStmt.get(ticketId) as
    | { id?: string; status?: string; returnUntil?: string | null }
    | undefined;
  const id = ticket?.id?.trim();
  const returnUntil = ticket?.returnUntil?.trim();
  if (!id || !returnUntil || ticket?.status !== 'absent_return_later') {
    return null;
  }
  return { id, status: 'absent_return_later', returnUntil };
}

function isRecallWindowExpired(returnUntil: string, nowIso: string): boolean {
  const nowMs = Date.parse(nowIso);
  const deadlineMs = Date.parse(returnUntil);
  if (Number.isNaN(nowMs) || Number.isNaN(deadlineMs)) {
    return false;
  }
  return deadlineMs <= nowMs;
}

function autoReturnRecallWindowInDb(deps: QueueDeps, ticketId: string): boolean {
  const ticket = readRecallWindowTicket(deps, ticketId);
  if (!ticket) {
    return false;
  }

  applyQueueStatusTransition(deps, {
    ticketId: ticket.id,
    fromStatus: ticket.status,
    toStatus: 'waiting',
    updatedAt: deps.nowIso(),
    clearRoom: true,
    returnUntil: null,
    callbackPhone: null,
  });
  return true;
}

export function processExpiredRecallWindowForTicketInDb(
  deps: QueueDeps,
  ticketId: string,
): boolean {
  const ticket = readRecallWindowTicket(deps, ticketId);
  if (!ticket) {
    return false;
  }
  if (!isRecallWindowExpired(ticket.returnUntil, deps.nowIso())) {
    return false;
  }
  return autoReturnRecallWindowInDb(deps, ticket.id);
}

export function processExpiredRecallWindowsInDb(deps: QueueDeps): string[] {
  const nowIso = deps.nowIso();
  const rows = deps.listExpiredRecallWindowsStmt.all(deps.getBusinessDay(), nowIso) as Array<{
    id?: string;
    returnUntil?: string | null;
  }>;

  const transitioned: string[] = [];
  for (const row of rows) {
    const ticketId = row.id?.trim();
    if (!ticketId) {
      continue;
    }
    if (processExpiredRecallWindowForTicketInDb(deps, ticketId)) {
      transitioned.push(ticketId);
    }
  }

  return transitioned;
}

export function getQueueSummaryFromDb(deps: QueueDeps): QueueSummary {
  const businessDay = deps.getBusinessDay();
  const row = deps.queueSummaryStmt.get(businessDay, businessDay) as
    | {
        waitingNow?: number;
        calledNow?: number;
        inRoomNow?: number;
        absentNow?: number;
        processedToday?: number;
      }
    | undefined;

  return {
    waitingNow: row?.waitingNow ?? 0,
    calledNow: row?.calledNow ?? 0,
    inRoomNow: row?.inRoomNow ?? 0,
    absentNow: row?.absentNow ?? 0,
    processedToday: row?.processedToday ?? 0,
  };
}

function readTicketRoomId(deps: QueueDeps, ticketId: string): string | null {
  const ticket = listQueueFromDb(deps).find((entry) => entry.id === ticketId);
  const roomId = ticket?.roomId?.trim();
  return roomId ? roomId : null;
}

function resolveCheckInTargetRoomId(
  currentRoomId: string | null,
  roomId?: string,
  roomLabel?: string,
): string | null {
  const trimmedRoomId = roomId?.trim();
  if (trimmedRoomId) {
    return trimmedRoomId;
  }
  if (roomLabel?.trim()) {
    return currentRoomId;
  }
  return null;
}

export function callTicketInDb(
  deps: QueueDeps,
  ticketId: string,
  roomId?: string,
  roomLabel?: string,
): StatusTransitionResult {
  const ticket = requireTicketFromDb(deps, ticketId);
  assertTransition(ticket.status, ['waiting']);

  const nextStatus: TicketStatus = 'called';
  const calledAt = deps.nowIso();
  const resolvedRoom = resolveCallRoomForTicket(deps.getOpsSettings(), roomId, roomLabel, {
    roomId: ticket.destinationRoomId,
    roomLabel: ticket.destinationRoomLabel,
  });
  if (resolvedRoom?.roomId) {
    assertRoomHasCapacity(deps.getOpsSettings(), listQueueFromDb(deps), resolvedRoom.roomId);
  }
  applyQueueStatusTransition(deps, {
    ticketId,
    fromStatus: ticket.status,
    toStatus: nextStatus,
    updatedAt: calledAt,
    useCalledUpdate: true,
    setRoom: true,
    roomId: resolvedRoom?.roomId ?? null,
    roomLabel: resolvedRoom?.roomLabel ?? null,
  });
  return { fromStatus: ticket.status, toStatus: nextStatus };
}

export function checkInRoomInDb(
  deps: QueueDeps,
  ticketId: string,
  roomId?: string,
  roomLabel?: string,
  actingRoomId?: string,
): StatusTransitionResult {
  const ticket = requireTicketFromDb(deps, ticketId);
  assertTransition(ticket.status, ['called']);

  const currentRoomId = readTicketRoomId(deps, ticketId);
  assertQueueRoomScope(currentRoomId, actingRoomId);
  const targetRoomId = resolveCheckInTargetRoomId(currentRoomId, roomId, roomLabel);
  const setRoom = Boolean(roomId?.trim() || roomLabel?.trim());
  if (setRoom && targetRoomId) {
    assertRoomHasCapacity(deps.getOpsSettings(), listQueueFromDb(deps), targetRoomId, ticketId);
  }

  const nextStatus: TicketStatus = 'in_room';
  const updatedAt = deps.nowIso();
  applyQueueStatusTransition(deps, {
    ticketId,
    fromStatus: ticket.status,
    toStatus: nextStatus,
    updatedAt,
    setRoom,
    roomId: roomId ?? null,
    roomLabel: roomLabel ?? null,
  });
  return { fromStatus: ticket.status, toStatus: nextStatus };
}

export function reassignRoomInDb(
  deps: QueueDeps,
  ticketId: string,
  roomId?: string,
  roomLabel?: string,
): StatusTransitionResult {
  const ticket = requireTicketFromDb(deps, ticketId);
  assertTransition(ticket.status, ['called', 'in_room']);

  const resolvedRoom = resolveCallRoomForTicket(deps.getOpsSettings(), roomId, roomLabel, {
    roomId: ticket.destinationRoomId,
    roomLabel: ticket.destinationRoomLabel,
  });
  if (!resolvedRoom) {
    throw domainError('ROOM_REQUIRED');
  }

  const currentRoomId = readTicketRoomId(deps, ticketId);
  const roomChanged = resolvedRoom.roomId !== currentRoomId;
  if (roomChanged) {
    assertRoomHasCapacity(
      deps.getOpsSettings(),
      listQueueFromDb(deps),
      resolvedRoom.roomId,
      ticketId,
    );
  }

  const nextStatus: TicketStatus =
    ticket.status === 'in_room' && roomChanged ? 'called' : ticket.status;
  const updatedAt = deps.nowIso();
  applyQueueStatusTransition(deps, {
    ticketId,
    fromStatus: ticket.status,
    toStatus: nextStatus,
    updatedAt,
    setRoom: true,
    roomId: resolvedRoom.roomId,
    roomLabel: resolvedRoom.roomLabel,
  });
  return { fromStatus: ticket.status, toStatus: nextStatus };
}

export function checkOutRoomInDb(
  deps: QueueDeps,
  ticketId: string,
  actingRoomId?: string,
): StatusTransitionResult {
  const ticket = requireTicketFromDb(deps, ticketId);
  assertTransition(ticket.status, ['in_room']);
  assertQueueRoomScope(readTicketRoomId(deps, ticketId), actingRoomId);
  const nextStatus: TicketStatus = 'done';
  const updatedAt = deps.nowIso();
  applyQueueStatusTransition(deps, {
    ticketId,
    fromStatus: ticket.status,
    toStatus: nextStatus,
    updatedAt,
    roomId: null,
    roomLabel: null,
    returnUntil: null,
    callbackPhone: null,
  });
  return { fromStatus: ticket.status, toStatus: nextStatus };
}

export function returnToWaitingInDb(deps: QueueDeps, ticketId: string): StatusTransitionResult {
  const ticket = requireTicketFromDb(deps, ticketId);
  assertTransition(ticket.status, ['called', 'in_room', 'absent_wait_here', 'absent_return_later']);

  const nextStatus: TicketStatus = 'waiting';
  const updatedAt = deps.nowIso();
  applyQueueStatusTransition(deps, {
    ticketId,
    fromStatus: ticket.status,
    toStatus: nextStatus,
    updatedAt,
    clearRoom: true,
    roomId: null,
    roomLabel: null,
    callbackPhone: null,
  });
  return { fromStatus: ticket.status, toStatus: nextStatus };
}

export function setRecallNotifyErrorInDb(
  deps: QueueDeps,
  ticketId: string,
  errorCode: string | null,
): void {
  deps.updateQueueRecallNotifyErrorStmt.run(errorCode, ticketId);
}

export function setRecallNotifySentInDb(deps: QueueDeps, ticketId: string, sent: boolean): void {
  deps.updateQueueRecallNotifySentStmt.run(sent ? 1 : 0, ticketId);
}

export function clearRecallNotifyStateInDb(deps: QueueDeps, ticketId: string): void {
  deps.updateQueueRecallNotifyErrorStmt.run(null, ticketId);
  deps.updateQueueRecallNotifySentStmt.run(0, ticketId);
}

const CALLBACK_PHONE_ALLOWED_STATUSES: TicketStatus[] = [
  'waiting',
  'called',
  'absent_wait_here',
  'absent_return_later',
];

const IDENTITY_REF_MAX_LENGTH = 160;

export function setIdentityRefInDb(
  deps: QueueDeps,
  ticketId: string,
  identityRef: string,
): { identityRef: string; updatedAt: string } {
  const row = deps.getTicketIdentityViewStmt.get(ticketId) as
    | { ticketId?: string; status?: string; identityRef?: string | null }
    | undefined;
  if (!row?.ticketId || !row.status || !isTicketStatus(row.status)) {
    throw domainError('TICKET_NOT_FOUND');
  }
  assertTransition(row.status, ['waiting']);
  if (row.identityRef?.trim()) {
    throw domainError('INVALID_TRANSITION');
  }

  const trimmed = identityRef.trim();
  if (!trimmed || trimmed.length > IDENTITY_REF_MAX_LENGTH) {
    throw domainError('INVALID_ARGUMENT');
  }

  const updatedAt = deps.nowIso();
  deps.updateTicketIdentityRefStmt.run(trimmed, updatedAt, ticketId);
  return { identityRef: trimmed, updatedAt };
}

const TRIAGE_ALLOWED_STATUSES: TicketStatus[] = [
  'waiting',
  'called',
  'in_room',
  'absent_wait_here',
  'absent_return_later',
];

export function cycleTriageInDb(
  deps: QueueDeps,
  ticketId: string,
): { triageLevel: TriageLevel | null; updatedAt: string } {
  const ticket = requireTicketFromDb(deps, ticketId);
  assertTransition(ticket.status, TRIAGE_ALLOWED_STATUSES);

  const row = listQueueFromDb(deps).find((entry) => entry.id === ticketId);
  if (!row) {
    throw domainError('TICKET_NOT_FOUND');
  }

  const triageLevel = cycleTriageLevel(row.triageLevel);
  const updatedAt = deps.nowIso();
  deps.updateQueueTriageLevelStmt.run(triageLevel, ticketId);
  return { triageLevel, updatedAt };
}

export function setCallbackPhoneInDb(
  deps: QueueDeps,
  ticketId: string,
  callbackPhone: string,
): { callbackPhone: string; updatedAt: string } {
  const ticket = requireTicketFromDb(deps, ticketId);
  assertTransition(ticket.status, CALLBACK_PHONE_ALLOWED_STATUSES);

  const canonical = canonicalizePhone(callbackPhone);
  if (!canonical) {
    throw domainError('INVALID_ARGUMENT');
  }

  const updatedAt = deps.nowIso();
  deps.updateQueueCallbackPhoneStmt.run(canonical, ticketId);
  return { callbackPhone: canonical, updatedAt };
}

export function clearCallbackPhoneInDb(deps: QueueDeps, ticketId: string): { updatedAt: string } {
  const ticket = requireTicketFromDb(deps, ticketId);
  assertTransition(ticket.status, CALLBACK_PHONE_ALLOWED_STATUSES);

  const updatedAt = deps.nowIso();
  deps.updateQueueCallbackPhoneStmt.run(null, ticketId);
  return { updatedAt };
}

function readRecallNotifyRetryContext(
  deps: QueueDeps,
  ticketId: string,
): {
  returnUntil: string;
  returnWindowMinutes: number;
  callbackPhone: string;
  checkinLocale: string | null;
} {
  const ticket = deps.getTicketDetailStmt.get(ticketId) as
    | {
        id?: string;
        status?: TicketStatus;
        callbackPhone?: string | null;
        checkinPhone?: string | null;
        checkinLocale?: string | null;
        returnUntil?: string | null;
        recallNotifyErrorCode?: string | null;
      }
    | undefined;
  if (!ticket?.id || !ticket.status) {
    throw domainError('TICKET_NOT_FOUND');
  }
  if (ticket.status !== 'absent_return_later') {
    throw domainError('INVALID_TRANSITION');
  }
  if (!ticket.recallNotifyErrorCode?.trim()) {
    throw domainError('RECALL_NOTIFY_RETRY_NOT_ALLOWED');
  }
  const returnUntil = ticket.returnUntil?.trim() ?? '';
  if (!returnUntil) {
    throw domainError('INVALID_TRANSITION');
  }

  const deadlineMs = Date.parse(returnUntil);
  const nowMs = Date.parse(deps.nowIso());
  if (Number.isNaN(deadlineMs) || Number.isNaN(nowMs)) {
    throw domainError('INVALID_TRANSITION');
  }
  if (deadlineMs <= nowMs) {
    throw domainError('RECALL_WINDOW_EXPIRED');
  }

  const notifyPhone = resolveRecallNotifyPhone(ticket.callbackPhone, ticket.checkinPhone);
  if (notifyPhone == null) {
    throw domainError('MISSING_CALLBACK_PHONE');
  }

  const remainingMs = deadlineMs - nowMs;
  const returnWindowMinutes = Math.max(1, Math.ceil(remainingMs / 60_000));

  return {
    returnUntil,
    returnWindowMinutes,
    callbackPhone: notifyPhone,
    checkinLocale: ticket.checkinLocale?.trim() || null,
  };
}

export function retryRecallNotifyInDb(
  deps: QueueDeps,
  ticketId: string,
): {
  returnUntil: string;
  returnWindowMinutes: number;
  callbackPhone: string;
  checkinLocale: string | null;
} {
  return readRecallNotifyRetryContext(deps, ticketId);
}

export function setAbsenceInDb(
  deps: QueueDeps,
  ticketId: string,
  mode: AbsenceMode,
): StatusTransitionResult {
  const ticket = requireTicketFromDb(deps, ticketId);
  assertTransition(ticket.status, ['waiting', 'called']);

  const statusByMode: Record<AbsenceMode, TicketStatus> = {
    wait_here: 'absent_wait_here',
    return_later: 'absent_return_later',
  };

  const nextStatus = statusByMode[mode];
  const updatedAt = deps.nowIso();
  applyQueueStatusTransition(deps, {
    ticketId,
    fromStatus: ticket.status,
    toStatus: nextStatus,
    updatedAt,
    clearRoom: true,
    absenceMode: mode,
  });
  return { fromStatus: ticket.status, toStatus: nextStatus };
}

export function recallTicketInDb(
  deps: QueueDeps,
  ticketId: string,
  returnWindowMinutes?: number,
): {
  fromStatus: string;
  toStatus: string;
  returnUntil: string;
  returnWindowMinutes: number;
  callbackPhone: string | null;
  checkinLocale: string | null;
} {
  const ticket = deps.getTicketDetailStmt.get(ticketId) as
    | {
        id?: string;
        status?: TicketStatus;
        callbackPhone?: string | null;
        checkinPhone?: string | null;
        checkinLocale?: string | null;
      }
    | undefined;
  if (!ticket?.id || !ticket.status) {
    throw domainError('TICKET_NOT_FOUND');
  }
  assertTransition(ticket.status, ['absent_wait_here', 'absent_return_later']);
  clearRecallNotifyStateInDb(deps, ticketId);
  const notifyPhone = resolveRecallNotifyPhone(ticket.callbackPhone, ticket.checkinPhone);

  const nextStatus: TicketStatus = 'absent_return_later';
  const updatedAt = deps.nowIso();
  const windowMinutes = returnWindowMinutes ?? deps.getReturnWindowMinutes();
  const returnUntil = new Date(Date.now() + windowMinutes * 60 * 1000).toISOString();
  // Fachregel: alle Abwesenheitsvarianten werden beim Rueckholen auf absent_return_later vereinheitlicht.
  applyQueueStatusTransition(deps, {
    ticketId,
    fromStatus: ticket.status,
    toStatus: nextStatus,
    updatedAt,
    returnUntil,
  });
  return {
    fromStatus: ticket.status,
    toStatus: nextStatus,
    returnUntil,
    returnWindowMinutes: windowMinutes,
    callbackPhone: notifyPhone,
    checkinLocale: ticket.checkinLocale?.trim() || null,
  };
}
