import type { DatabaseSync } from 'node:sqlite';

const ALLOCATE_SQL = `
  INSERT INTO daily_queue_counters (scope, counter_date, next_value)
  VALUES (?, ?, 1)
  ON CONFLICT(scope, counter_date) DO UPDATE SET next_value = next_value + 1
  RETURNING next_value
`;

/** Atomare Laufnummer pro Counter-Scope und Tag. */
export function allocateQueueSequence(db: DatabaseSync, params: { scope: string; date: string }): number {
  const row = db.prepare(ALLOCATE_SQL).get(params.scope, params.date) as { next_value: number };
  return Number(row.next_value);
}
