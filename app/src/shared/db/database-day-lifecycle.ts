import type { StatementSync } from 'node:sqlite';
import type { DayClosePhase, DayLifecycleState } from './db-types.js';
import { getBusinessDayVisitStatsFromDb } from './database-business-day-stats.js';
import { domainError } from '../errors/domain-error.js';
import { executeResetKernel } from './database-reset-kernel.js';
import { isSandboxResetPendingFromStmt } from './database-sandbox-reset-state.js';

type DayCloseStateRow =
  | { locked?: number; phase?: string; lastResetBusinessDay?: string }
  | undefined;

type DayLifecycleStatements = {
  dayCloseStateStmt: StatementSync;
  updateCheckinLockStmt: StatementSync;
  updateDayClosePhaseStmt: StatementSync;
  updateLastResetBusinessDayStmt: StatementSync;
  deleteAllOutboxEventsStmt: StatementSync;
  clearEmergencyStateStmt: StatementSync;
  emergencyStateStmt: StatementSync;
  countAllVisitsStmt: StatementSync;
  countVisitsByBusinessDayStmt: StatementSync;
  maxWaitMsByBusinessDayStmt: StatementSync;
  topicCountsByBusinessDayStmt: StatementSync;
  listOpenVisitsByBusinessDayStmt: StatementSync;
  sandboxResetPendingStmt?: StatementSync;
};

type DayLifecycleHelpers = {
  nowIso: () => string;
  getBusinessDay: () => string;
  normalizeDayClosePhase: (phase: string | undefined) => DayClosePhase;
  emitOutboxEvent: (
    eventType: string,
    aggregateId: string,
    payload: Record<string, unknown>,
  ) => void;
};

type DayLifecycleDeps = DayLifecycleStatements & DayLifecycleHelpers;

type DayResetResult = {
  dayClosePhase: DayClosePhase;
  resetVisitCount: number;
  updatedAt: string;
  lastResetBusinessDay: string;
  emergencyCleared: boolean;
  sandboxRestartRequired: true;
};

function resolveNeedsDayStartHint(
  deps: Pick<DayLifecycleHelpers, 'getBusinessDay'>,
  row: DayCloseStateRow,
): boolean {
  const businessDay = deps.getBusinessDay();
  const lastResetBusinessDay = row?.lastResetBusinessDay ?? businessDay;
  return businessDay !== lastResetBusinessDay;
}

export function needsDayStartHintFromRow(
  deps: Pick<DayLifecycleHelpers, 'getBusinessDay'>,
  row: DayCloseStateRow,
): boolean {
  return resolveNeedsDayStartHint(deps, row);
}

export function isEffectiveCheckinLockedFromRow(
  deps: Pick<DayLifecycleHelpers, 'getBusinessDay'>,
  row: DayCloseStateRow,
): boolean {
  return row?.locked === 1 || needsDayStartHintFromRow(deps, row);
}

/** Patient check-in blocked until MFA resets the business day or unlocks after reset. */
export function isEffectiveCheckinLockedFromDb(deps: DayLifecycleDeps): boolean {
  const row = deps.dayCloseStateStmt.get() as DayCloseStateRow;
  return (
    isEffectiveCheckinLockedFromRow(deps, row) ||
    Boolean(
      deps.sandboxResetPendingStmt && isSandboxResetPendingFromStmt(deps.sandboxResetPendingStmt),
    )
  );
}

function executeBusinessDayReset(deps: DayLifecycleDeps, resetVisitCount: number): DayResetResult {
  const resetState = executeResetKernel(deps);
  deps.emitOutboxEvent('BusinessDayReset', 'ops', {
    updatedAt: resetState.updatedAt,
    dayClosePhase: resetState.dayClosePhase,
    resetVisitCount,
    lastResetBusinessDay: resetState.lastResetBusinessDay,
    sandboxRestartRequired: resetState.sandboxRestartRequired,
  });
  return {
    dayClosePhase: resetState.dayClosePhase,
    resetVisitCount,
    updatedAt: resetState.updatedAt,
    lastResetBusinessDay: resetState.lastResetBusinessDay,
    emergencyCleared: resetState.emergencyCleared,
    sandboxRestartRequired: resetState.sandboxRestartRequired,
  };
}

export function getDayLifecycleStateFromDb(deps: DayLifecycleDeps): DayLifecycleState {
  const businessDay = deps.getBusinessDay();
  const row = deps.dayCloseStateStmt.get() as DayCloseStateRow;
  const lastResetBusinessDay = row?.lastResetBusinessDay ?? businessDay;

  const needsDayStartHint =
    resolveNeedsDayStartHint(deps, row) ||
    Boolean(
      deps.sandboxResetPendingStmt && isSandboxResetPendingFromStmt(deps.sandboxResetPendingStmt),
    );
  const lastDayStats = needsDayStartHint
    ? getBusinessDayVisitStatsFromDb(deps, lastResetBusinessDay)
    : null;

  return {
    businessDay,
    lastResetBusinessDay,
    needsDayStartHint,
    checkinLocked: row?.locked === 1,
    dayClosePhase: deps.normalizeDayClosePhase(row?.phase),
    lastDayStats,
  };
}

export function startDayCloseInDb(deps: DayLifecycleDeps): {
  dayClosePhase: DayClosePhase;
  updatedAt: string;
} {
  const state = deps.dayCloseStateStmt.get() as DayCloseStateRow;
  const dayClosePhase = deps.normalizeDayClosePhase(state?.phase);
  const checkinLocked = state?.locked === 1;

  if (!checkinLocked) {
    throw domainError('CHECKIN_LOCK_REQUIRED');
  }
  if (dayClosePhase !== 'open') {
    throw domainError('INVALID_DAY_CLOSE_PHASE');
  }

  const updatedAt = deps.nowIso();
  deps.updateDayClosePhaseStmt.run('started', updatedAt);
  deps.emitOutboxEvent('DayCloseStarted', 'ops', {
    updatedAt,
    dayClosePhase: 'started',
  });
  return { dayClosePhase: 'started', updatedAt };
}

export function resetBusinessDayInDb(deps: DayLifecycleDeps): DayResetResult {
  const totalRow = deps.countAllVisitsStmt.get() as { count?: number } | undefined;
  const resetVisitCount = totalRow?.count ?? 0;
  return executeBusinessDayReset(deps, resetVisitCount);
}
