import type { StatementSync } from 'node:sqlite';
import {
  needsDayStartHintFromRow,
  isEffectiveCheckinLockedFromRow,
} from './database-day-lifecycle.js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  isSessionStatus,
  type DayClosePhase,
  type OpsSettings,
  type PatientSession,
  type PatientSessionMe,
  type SessionResolveResult,
  type VisitIdentityView,
  type VisitPortalContext,
  type QueueDisplayStatus,
} from './db-types.js';
import { parseTicketCode, formatTicketCode } from '../queue/ticket-code.js';
import {
  getBusinessMinutesOfDay,
  isPracticeOpenAt,
  isTopicAvailableAt,
} from '../practice-time-windows.js';
import { domainError } from '../errors/domain-error.js';

type CheckinSessionStatements = {
  findTicketByCodeStmt: StatementSync;
  checkinLockStmt: StatementSync;
  dayCloseStateStmt: StatementSync;
  updateCheckinLockStmt: StatementSync;
  getVisitIdentityViewStmt: StatementSync;
  insertPatientSessionStmt: StatementSync;
  expireActiveSessionsByVisitStmt: StatementSync;
  getActiveSessionByVisitStmt: StatementSync;
  getPatientSessionByTokenStmt: StatementSync;
  getVisitPortalContextStmt: StatementSync;
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
    | 'dayCloseStateStmt'
    | 'normalizeDayClosePhase'
    | 'getBusinessDay'
    | 'getBusinessTimeZone'
    | 'getOpsSettings'
    | 'checkinLockStmt'
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

export function getVisitPortalContextFromDb(
  deps: Pick<CheckinSessionDeps, 'getVisitPortalContextStmt'>,
  visitId: string,
): VisitPortalContext {
  const row = deps.getVisitPortalContextStmt.get(visitId.trim()) as
    | { authPath?: string }
    | undefined;
  if (!row?.authPath) {
    throw domainError('VISIT_NOT_FOUND');
  }
  return {
    authPath: row.authPath,
  };
}

export function getPatientSessionMeFromDb(
  deps: CheckinSessionDeps,
  sessionToken: string,
): PatientSessionMe {
  const session = requirePatientSessionFromDb(deps, sessionToken);
  const portal = getVisitPortalContextFromDb(deps, session.visitId);
  return {
    ...session,
    ...portal,
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
        visitId?: string;
        expiresAt?: string;
        status?: string;
        createdAt?: string;
      }
    | undefined;
  if (
    !session?.sessionId ||
    !session.visitId ||
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
    visitId: session.visitId,
    expiresAt: session.expiresAt,
    createdAt: session.createdAt,
    status: session.status,
  };
}

function findActiveVisitByTicketCodeInDb(
  deps: CheckinSessionDeps,
  ticketCode: string,
): { visitId: string } {
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

  const blockedVisitStatuses = new Set(['done', 'cancelled', 'no_show']);
  if (blockedVisitStatuses.has(ticket.status)) {
    throw domainError('SESSION_TICKET_NOT_ACTIVE');
  }

  return { visitId: ticket.id };
}

export function verifyTicketCodeInDb(
  deps: CheckinSessionDeps,
  ticketCode: string,
): { visitId: string } {
  return findActiveVisitByTicketCodeInDb(deps, ticketCode);
}

export function getTicketCodeByVisitIdFromDb(deps: CheckinSessionDeps, visitId: string): string {
  const view = getVisitIdentityViewFromDb(deps, visitId);
  return formatTicketCode(view.laneCode, view.number);
}

export function resolvePatientSessionInDb(
  deps: CheckinSessionDeps,
  ticketCode: string,
  ttlMinutes = 30,
): SessionResolveResult {
  const { visitId } = findActiveVisitByTicketCodeInDb(deps, ticketCode);

  const timestamp = deps.nowIso();
  deps.expireActiveSessionsByVisitStmt.run(timestamp, visitId);

  const createdAt = deps.nowIso();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
  const sessionId = randomUUID();
  const sessionToken = randomBytes(32).toString('hex');
  const tokenHash = hashToken(sessionToken);
  try {
    deps.insertPatientSessionStmt.run(
      sessionId,
      visitId,
      tokenHash,
      'active',
      expiresAt,
      createdAt,
      createdAt,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('UNIQUE constraint failed: patient_sessions.visit_id')
    ) {
      throw domainError('SESSION_ALREADY_ACTIVE');
    }
    throw error;
  }
  return {
    sessionId,
    sessionToken,
    expiresAt,
    visitId,
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
    visitId: session.visitId,
    closedAt,
    reason: 'patient_submit',
  });
  return {
    sessionId: session.sessionId,
    status: 'revoked',
    closedAt,
  };
}

/** Identity view: Core visit fields + effective queue status via visit_host_state absent overlay. */
export function getVisitIdentityViewFromDb(
  deps: CheckinSessionDeps,
  visitIdRaw: string,
): VisitIdentityView {
  const visitId = visitIdRaw.trim();
  const row = deps.getVisitIdentityViewStmt.get(visitId) as
    | {
        visitId?: string;
        laneCode?: string;
        number?: number;
        topicId?: string;
        topicLabel?: string;
        authPath?: string;
        identityRef?: string | null;
        status?: QueueDisplayStatus;
        createdAt?: string;
        updatedAt?: string;
      }
    | undefined;
  if (
    !row?.visitId ||
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
    throw domainError('VISIT_NOT_FOUND');
  }
  const number: number = row.number;
  return {
    visitId: row.visitId,
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
