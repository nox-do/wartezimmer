import type { StatementSync } from 'node:sqlite';
import {
  needsDayStartHintFromRow,
  isEffectiveCheckinLockedFromRow,
} from './database-day-lifecycle.js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  isSessionStatus,
  isTicketStatus,
  type CreateTicketCallerInput,
  type CreateTicketInput,
  type DayClosePhase,
  type OpsSettings,
  type PatientSession,
  type PatientSessionMe,
  type SessionResolveResult,
  type TicketIdentityView,
  type TicketPortalContext,
  type TicketStatus,
} from './db-types.js';
import { parseTicketCode, formatTicketCode } from '../queue/ticket-code.js';
import {
  resolveTopicLabelFromSettings,
  resolveTicketLaneCodeFromSettings,
  resolveDestinationRoomForTopic,
} from '../checkin-topic-settings.js';
import {
  getBusinessMinutesOfDay,
  isPracticeOpenAt,
  isTopicAvailableAt,
} from '../practice-time-windows.js';
import { domainError } from '../errors/domain-error.js';

type CheckinSessionStatements = {
  findTicketByCodeStmt: StatementSync;
  getNextTicketNumberStmt: StatementSync;
  insertTicketStmt: StatementSync;
  insertQueueEntryStmt: StatementSync;
  checkinLockStmt: StatementSync;
  dayCloseStateStmt: StatementSync;
  updateCheckinLockStmt: StatementSync;
  getTicketIdentityViewStmt: StatementSync;
  insertPatientSessionStmt: StatementSync;
  expireActiveSessionsByTicketStmt: StatementSync;
  getActiveSessionByTicketStmt: StatementSync;
  getPatientSessionByTokenStmt: StatementSync;
  getTicketPortalContextStmt: StatementSync;
  touchPatientSessionStmt: StatementSync;
  expirePatientSessionStmt: StatementSync;
  revokePatientSessionStmt: StatementSync;
};

type CheckinSessionHelpers = {
  nowIso: () => string;
  getBusinessDay: () => string;
  getBusinessTimeZone: () => string;
  getOpsSettings: () => OpsSettings;
  normalizeDayClosePhase: (phase: string | undefined) => DayClosePhase;
  emitOutboxEvent: (
    eventType: string,
    aggregateId: string,
    payload: Record<string, unknown>,
  ) => void;
};

export type CheckinSessionDeps = CheckinSessionStatements & CheckinSessionHelpers;

function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function padTicketNumber(value: number): string {
  return String(value).padStart(3, '0');
}

function compactBusinessDay(value: string): string {
  return value.replaceAll('-', '');
}

export function isCheckinLockedFromDb(deps: Pick<CheckinSessionDeps, 'checkinLockStmt'>): boolean {
  const row = deps.checkinLockStmt.get() as { locked?: number } | undefined;
  return row?.locked === 1;
}

export function getOpsStateFromDb(
  deps: Pick<CheckinSessionDeps, 'dayCloseStateStmt' | 'normalizeDayClosePhase'>,
): { checkinLocked: boolean; dayClosePhase: DayClosePhase } {
  const row = deps.dayCloseStateStmt.get() as { locked?: number; phase?: string } | undefined;
  return {
    checkinLocked: row?.locked === 1,
    dayClosePhase: deps.normalizeDayClosePhase(row?.phase),
  };
}

export function setCheckinLockInDb(
  deps: CheckinSessionDeps,
  locked: boolean,
): { checkinLocked: boolean; updatedAt: string } {
  const state = deps.dayCloseStateStmt.get() as
    | { phase?: string; lastResetBusinessDay?: string }
    | undefined;
  const dayClosePhase = deps.normalizeDayClosePhase(state?.phase);
  if (!locked && needsDayStartHintFromRow(deps, state)) {
    throw domainError('CHECKIN_LOCKED');
  }
  if (!locked && dayClosePhase === 'started') {
    throw domainError('DAY_CLOSE_IN_PROGRESS');
  }

  const updatedAt = deps.nowIso();
  deps.updateCheckinLockStmt.run(locked ? 1 : 0, updatedAt);
  return { checkinLocked: locked, updatedAt };
}

export function assertCheckInAllowed(
  deps: Pick<
    CheckinSessionDeps,
    | 'dayCloseStateStmt'
    | 'normalizeDayClosePhase'
    | 'getBusinessDay'
    | 'getBusinessTimeZone'
    | 'getOpsSettings'
    | 'checkinLockStmt'
  >,
  topicId: string,
): void {
  const state = deps.dayCloseStateStmt.get() as
    | { locked?: number; phase?: string; lastResetBusinessDay?: string }
    | undefined;
  const dayClosePhase = deps.normalizeDayClosePhase(state?.phase);
  if (isEffectiveCheckinLockedFromRow(deps, state) || dayClosePhase !== 'open') {
    throw domainError('CHECKIN_LOCKED');
  }

  const opsSettings = deps.getOpsSettings();
  const nowMinutes = getBusinessMinutesOfDay(deps.getBusinessTimeZone());
  if (topicId !== 'mfa') {
    const topicSettings = opsSettings.topics.find((item) => item.topicId === topicId);
    if (!topicSettings) {
      throw domainError('UNKNOWN_TOPIC');
    }
    if (!topicSettings.enabled) {
      throw domainError('TOPIC_DISABLED');
    }
    try {
      if (!isTopicAvailableAt(topicSettings, nowMinutes)) {
        throw domainError('TOPIC_CLOSED');
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'TOPIC_CLOSED') {
        throw error;
      }
      throw domainError('OPS_SETTINGS_INVALID', { cause: error });
    }
  }

  try {
    if (!isPracticeOpenAt(opsSettings, nowMinutes)) {
      throw domainError('CHECKIN_CLOSED');
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'CHECKIN_CLOSED') {
      throw error;
    }
    throw domainError('OPS_SETTINGS_INVALID', { cause: error });
  }
}

export function assertTerminalAssistPressAllowed(
  deps: Pick<
    CheckinSessionDeps,
    'dayCloseStateStmt' | 'normalizeDayClosePhase' | 'getBusinessDay' | 'getBusinessTimeZone' | 'getOpsSettings' | 'checkinLockStmt'
  >,
): void {
  const state = deps.dayCloseStateStmt.get() as
    | { locked?: number; phase?: string; lastResetBusinessDay?: string }
    | undefined;
  const dayClosePhase = deps.normalizeDayClosePhase(state?.phase);
  if (isEffectiveCheckinLockedFromRow(deps, state) || dayClosePhase !== 'open') {
    throw domainError('CHECKIN_LOCKED');
  }

  const opsSettings = deps.getOpsSettings();
  const nowMinutes = getBusinessMinutesOfDay(deps.getBusinessTimeZone());
  try {
    if (!isPracticeOpenAt(opsSettings, nowMinutes)) {
      throw domainError('CHECKIN_CLOSED');
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'CHECKIN_CLOSED') {
      throw error;
    }
    throw domainError('OPS_SETTINGS_INVALID', { cause: error });
  }
}

export function createTicketInDb(
  deps: CheckinSessionDeps,
  input: CreateTicketInput,
): { ticketId: string; number: number; createdAt: string } {
  assertCheckInAllowed(deps, input.topicId);

  const businessDay = deps.getBusinessDay();
  const createdAt = deps.nowIso();
  const updatedAt = createdAt;

  const laneCode = input.laneCode;
  const topicLabel = input.topicLabel.trim();
  const nextNumberRow = deps.getNextTicketNumberStmt.get(businessDay, laneCode) as
    | { next_number?: number }
    | undefined;
  const number = nextNumberRow?.next_number ?? 1;
  const ticketId = `${compactBusinessDay(businessDay)}-${laneCode}-${padTicketNumber(number)}`;

  const checkinPhone = input.checkinPhone?.trim() || null;
  const checkinLocale = input.checkinLocale?.trim() || null;
  deps.insertTicketStmt.run(
    ticketId,
    businessDay,
    laneCode,
    number,
    input.topicId,
    topicLabel,
    input.destinationRoomId,
    input.destinationRoomLabel,
    input.authPath,
    input.identityRef ?? null,
    checkinPhone,
    checkinLocale,
    'waiting',
    createdAt,
    updatedAt,
  );
  deps.insertQueueEntryStmt.run(ticketId, createdAt);
  deps.emitOutboxEvent('CheckinCreated', ticketId, {
    ticketId,
    topicId: input.topicId,
    topicLabel,
    authPath: input.authPath,
    laneCode,
    number,
    createdAt,
  });
  return { ticketId, number, createdAt };
}

export function buildCreateTicketInput(
  settings: OpsSettings,
  input: CreateTicketCallerInput,
): CreateTicketInput {
  const destination = resolveDestinationRoomForTopic(settings, input.topicId);
  if (!destination) {
    throw new Error('OPS_SETTINGS_INVALID', {
      cause: new Error('Check-in destination room could not be resolved.'),
    });
  }
  return {
    ...input,
    laneCode: resolveTicketLaneCodeFromSettings(settings, input.topicId),
    topicLabel: resolveTopicLabelFromSettings(settings, input.topicId),
    destinationRoomId: destination.roomId,
    destinationRoomLabel: destination.roomLabel,
  };
}

export function getTicketPortalContextFromDb(
  deps: Pick<CheckinSessionDeps, 'getTicketPortalContextStmt'>,
  ticketId: string,
): TicketPortalContext {
  const row = deps.getTicketPortalContextStmt.get(ticketId.trim()) as
    | { authPath?: string; checkinPhone?: string | null }
    | undefined;
  if (!row?.authPath) {
    throw domainError('TICKET_NOT_FOUND');
  }
  const storedPhone = row.checkinPhone?.trim() || null;
  return {
    authPath: row.authPath,
    checkinPhone: storedPhone,
  };
}

export function getPatientSessionMeFromDb(
  deps: CheckinSessionDeps,
  sessionToken: string,
): PatientSessionMe {
  const session = requirePatientSessionFromDb(deps, sessionToken);
  const ticket = getTicketPortalContextFromDb(deps, session.ticketId);
  return {
    ...session,
    ...ticket,
  };
}

export function requirePatientSessionFromDb(
  deps: CheckinSessionDeps,
  sessionToken: string,
): PatientSession {
  const tokenHash = hashToken(sessionToken);
  const session = deps.getPatientSessionByTokenStmt.get(tokenHash) as
    | {
        sessionId?: string;
        ticketId?: string;
        expiresAt?: string;
        status?: string;
        createdAt?: string;
      }
    | undefined;
  if (
    !session?.sessionId ||
    !session.ticketId ||
    !session.expiresAt ||
    !session.status ||
    !session.createdAt
  ) {
    throw domainError('SESSION_UNAUTHORIZED');
  }

  if (!isSessionStatus(session.status) || session.status !== 'active') {
    throw domainError('SESSION_UNAUTHORIZED');
  }

  if (Date.now() > Date.parse(session.expiresAt)) {
    deps.expirePatientSessionStmt.run(deps.nowIso(), session.sessionId);
    throw domainError('SESSION_EXPIRED');
  }

  const touchedAt = deps.nowIso();
  deps.touchPatientSessionStmt.run(touchedAt, touchedAt, session.sessionId);

  return {
    sessionId: session.sessionId,
    ticketId: session.ticketId,
    expiresAt: session.expiresAt,
    createdAt: session.createdAt,
    status: session.status,
  };
}

function findActiveTicketByCodeInDb(
  deps: CheckinSessionDeps,
  ticketCode: string,
): { ticketId: string } {
  const parsedCode = parseTicketCode(ticketCode);
  if (!parsedCode) {
    throw domainError('SESSION_INVALID_TICKET');
  }

  const ticket = deps.findTicketByCodeStmt.get(
    deps.getBusinessDay(),
    parsedCode.laneCode,
    parsedCode.number,
  ) as { id?: string; status?: string } | undefined;
  if (!ticket?.id || !ticket.status) {
    throw domainError('SESSION_INVALID_TICKET');
  }

  const blockedStatuses: TicketStatus[] = ['done', 'cancelled'];
  if (isTicketStatus(ticket.status) && blockedStatuses.includes(ticket.status)) {
    throw domainError('SESSION_TICKET_NOT_ACTIVE');
  }

  return { ticketId: ticket.id };
}

export function verifyTicketCodeInDb(
  deps: CheckinSessionDeps,
  ticketCode: string,
): { ticketId: string } {
  return findActiveTicketByCodeInDb(deps, ticketCode);
}

export function getTicketCodeByTicketIdFromDb(deps: CheckinSessionDeps, ticketId: string): string {
  const view = getTicketIdentityViewFromDb(deps, ticketId);
  return formatTicketCode(view.laneCode, view.number);
}

export function resolvePatientSessionInDb(
  deps: CheckinSessionDeps,
  ticketCode: string,
  ttlMinutes = 30,
): SessionResolveResult {
  const { ticketId } = findActiveTicketByCodeInDb(deps, ticketCode);

  const timestamp = deps.nowIso();
  deps.expireActiveSessionsByTicketStmt.run(timestamp, ticketId);

  const createdAt = deps.nowIso();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
  const sessionId = randomUUID();
  const sessionToken = randomBytes(32).toString('hex');
  const tokenHash = hashToken(sessionToken);
  try {
    deps.insertPatientSessionStmt.run(
      sessionId,
      ticketId,
      tokenHash,
      'active',
      expiresAt,
      createdAt,
      createdAt,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('UNIQUE constraint failed: patient_sessions.ticket_id')
    ) {
      throw domainError('SESSION_ALREADY_ACTIVE');
    }
    throw error;
  }
  return {
    sessionId,
    sessionToken,
    expiresAt,
    ticketId,
  };
}

export function submitPatientSessionInDb(
  deps: CheckinSessionDeps,
  sessionToken: string,
): { sessionId: string; status: 'revoked'; closedAt: string } {
  const session = requirePatientSessionFromDb(deps, sessionToken);
  const closedAt = deps.nowIso();
  deps.revokePatientSessionStmt.run(closedAt, session.sessionId);
  deps.emitOutboxEvent('PatientSessionClosed', session.sessionId, {
    sessionId: session.sessionId,
    ticketId: session.ticketId,
    closedAt,
    reason: 'patient_submit',
  });
  return {
    sessionId: session.sessionId,
    status: 'revoked',
    closedAt,
  };
}

export function getTicketIdentityViewFromDb(
  deps: CheckinSessionDeps,
  ticketIdRaw: string,
): TicketIdentityView {
  const ticketId = ticketIdRaw.trim();
  const row = deps.getTicketIdentityViewStmt.get(ticketId) as
    | {
        ticketId?: string;
        laneCode?: string;
        number?: number;
        topicId?: string;
        topicLabel?: string;
        authPath?: string;
        identityRef?: string | null;
        status?: TicketStatus;
        createdAt?: string;
        updatedAt?: string;
      }
    | undefined;
  if (
    !row?.ticketId ||
    !row.laneCode ||
    row.number == null ||
    !Number.isInteger(row.number) ||
    !row.topicId ||
    !row.topicLabel ||
    !row.authPath ||
    !row.status ||
    !row.createdAt ||
    !row.updatedAt
  ) {
    throw domainError('TICKET_NOT_FOUND');
  }
  const number: number = row.number;
  return {
    ticketId: row.ticketId,
    laneCode: row.laneCode,
    number,
    topicId: row.topicId,
    topicLabel: row.topicLabel,
    authPath: row.authPath,
    identityRef: row.identityRef ?? null,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
