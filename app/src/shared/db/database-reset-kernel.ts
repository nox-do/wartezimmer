import type { StatementSync } from 'node:sqlite';
import { getEmergencyStateFromDb, type EmergencyDeps } from './database-emergency.js';

type ResetKernelStatements = {
  deleteAllOutboxEventsStmt: StatementSync;
  clearEmergencyStateStmt: StatementSync;
  updateCheckinLockStmt: StatementSync;
  updateDayClosePhaseStmt: StatementSync;
  updateLastResetBusinessDayStmt: StatementSync;
  clearSandboxResetPendingStmt?: StatementSync;
};

type ResetKernelHelpers = {
  nowIso: () => string;
  getBusinessDay: () => string;
};

export type ResetKernelDeps = ResetKernelStatements &
  Pick<EmergencyDeps, 'emergencyStateStmt'> &
  ResetKernelHelpers;

export type ResetKernelResult = {
  updatedAt: string;
  lastResetBusinessDay: string;
  emergencyCleared: boolean;
  dayClosePhase: 'open';
  checkinLocked: true;
  sandboxRestartRequired: true;
};

export function executeResetKernel(deps: ResetKernelDeps): ResetKernelResult {
  const updatedAt = deps.nowIso();
  const lastResetBusinessDay = deps.getBusinessDay();
  const emergencyBefore = getEmergencyStateFromDb(deps);

  deps.deleteAllOutboxEventsStmt.run();
  if (emergencyBefore.active) {
    deps.clearEmergencyStateStmt.run(updatedAt);
  }

  deps.updateCheckinLockStmt.run(1, updatedAt);
  deps.updateDayClosePhaseStmt.run('open', updatedAt);
  deps.updateLastResetBusinessDayStmt.run(lastResetBusinessDay, updatedAt);
  deps.clearSandboxResetPendingStmt?.run(updatedAt);

  return {
    updatedAt,
    lastResetBusinessDay,
    emergencyCleared: emergencyBefore.active,
    dayClosePhase: 'open',
    checkinLocked: true,
    sandboxRestartRequired: true,
  };
}
