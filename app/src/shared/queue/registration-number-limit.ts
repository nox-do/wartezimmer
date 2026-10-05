import type { DatabaseSync } from 'node:sqlite';
import { laneCounterScope } from '@praxis-flow/flow-core';
import { getBusinessDay } from '../db/database-time.js';
import { domainError } from '../errors/domain-error.js';

/** PraxisFlow presentation policy. The reusable core deliberately has no such limit. */
export const MAX_REGISTRATION_NUMBER = 999;
export const REGISTRATION_LIMIT_MESSAGE =
  'Technisch bedingt sind pro Kennbuchstabe der Themen nur 999 Anmeldungen pro Praxistag möglich.';

/** Must run inside the host mutation transaction so rejected allocations are rolled back. */
export function assertRegistrationNumberAllowed(number: number): void {
  if (number > MAX_REGISTRATION_NUMBER) {
    throw domainError('REGISTRATION_LIMIT_REACHED');
  }
}

/** UI availability is advisory; the transactional allocation guard remains authoritative. */
export function isRegistrationLaneBlocked(db: DatabaseSync, laneCode: string): boolean {
  const row = db
    .prepare('SELECT next_value FROM daily_queue_counters WHERE scope = ? AND counter_date = ?')
    .get(laneCounterScope(laneCode), getBusinessDay()) as { next_value: number } | undefined;
  return (row?.next_value ?? 0) >= MAX_REGISTRATION_NUMBER;
}
