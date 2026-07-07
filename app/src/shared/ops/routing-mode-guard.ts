import type { DatabaseSync } from 'node:sqlite';
import { TERMINAL_VISIT_STATUSES } from '@praxis-flow/flow-core';
import type { RoutingMode } from '../db/db-types.js';

export function countActiveJourneyVisits(db: DatabaseSync): number {
  const terminalStatuses = [...TERMINAL_VISIT_STATUSES];
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count FROM visits
       WHERE journey_state = 'active'
       AND status NOT IN (${terminalStatuses.map(() => '?').join(', ')})`,
    )
    .get(...terminalStatuses) as { count: number } | undefined;
  return Number(row?.count ?? 0);
}

export function validateRoutingModeChange(input: {
  currentMode: RoutingMode;
  nextMode: RoutingMode;
  db: DatabaseSync;
}): { ok: true } | { ok: false; code: string; message: string; activeJourneyVisitCount: number } {
  if (input.currentMode === input.nextMode) {
    return { ok: true };
  }

  const activeJourneyVisitCount = countActiveJourneyVisits(input.db);
  if (activeJourneyVisitCount > 0) {
    return {
      ok: false,
      code: 'ROUTING_MODE_CHANGE_BLOCKED',
      message: `Routing mode cannot be changed while ${activeJourneyVisitCount} visit(s) have an active journey.`,
      activeJourneyVisitCount,
    };
  }

  return { ok: true };
}
