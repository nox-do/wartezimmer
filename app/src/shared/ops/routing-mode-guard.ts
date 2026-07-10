import type { DatabaseSync } from 'node:sqlite';
import { TERMINAL_VISIT_STATUSES } from '@praxis-flow/flow-core';
import type { RoutingMode } from '../db/db-types.js';
import { isComplexRoutingLicensed } from './routing-license.js';

/** Offene Wartenummern: Visits die noch nicht terminal sind. */
export function countOpenVisits(db: DatabaseSync): number {
  const terminalStatuses = [...TERMINAL_VISIT_STATUSES];
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count FROM visits
       WHERE status NOT IN (${terminalStatuses.map(() => '?').join(', ')})`,
    )
    .get(...terminalStatuses) as { count: number } | undefined;
  return Number(row?.count ?? 0);
}

export function validateRoutingModeChange(input: {
  currentMode: RoutingMode;
  nextMode: RoutingMode;
  db: DatabaseSync;
}): { ok: true } | { ok: false; code: string; message: string; openVisitCount: number } {
  if (input.currentMode === input.nextMode) {
    return { ok: true };
  }

  const openVisitCount = countOpenVisits(input.db);
  if (openVisitCount > 0) {
    return {
      ok: false,
      code: 'ROUTING_MODE_CHANGE_BLOCKED',
      message: `Routing mode cannot be changed while ${openVisitCount} waiting number(s) are still open.`,
      openVisitCount,
    };
  }

  return { ok: true };
}

export function validateComplexRoutingLicenseChange(input: {
  nextMode: RoutingMode;
}): { ok: true } | { ok: false; code: string; message: string } {
  if (input.nextMode !== 'complex') {
    return { ok: true };
  }

  if (isComplexRoutingLicensed()) {
    return { ok: true };
  }

  return {
    ok: false,
    code: 'COMPLEX_ROUTING_NOT_LICENSED',
    message: 'Complex routing is not included in your license.',
  };
}
