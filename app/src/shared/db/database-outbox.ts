import { randomUUID } from 'node:crypto';
import type { StatementSync } from 'node:sqlite';
import type { OutboxEventRow, OutboxStatus } from './db-types.js';

type OutboxStatements = {
  insertOutboxEventStmt: StatementSync;
  listPendingOutboxEventsStmt: StatementSync;
  claimOutboxEventStmt: StatementSync;
  markOutboxPublishedStmt: StatementSync;
  markOutboxRetryStmt: StatementSync;
  markOutboxDeadLetterStmt: StatementSync;
  getOutboxStatusStmt: StatementSync;
};

type OutboxHelpers = {
  nowIso: () => string;
};

export type OutboxDeps = OutboxStatements & OutboxHelpers;

export function emitOutboxEventFromDb(
  deps: OutboxDeps,
  eventType: string,
  aggregateId: string,
  payload: Record<string, unknown>,
): void {
  deps.insertOutboxEventStmt.run(
    randomUUID(),
    eventType,
    aggregateId,
    JSON.stringify(payload),
    deps.nowIso(),
  );
}

export function claimPendingOutboxEventsInDb(
  deps: OutboxDeps,
  limit: number,
  leaseMs: number,
): OutboxEventRow[] {
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit || 1)));
  const safeLeaseMs = Math.max(1000, Math.min(300_000, Math.trunc(leaseMs || 1000)));
  const now = deps.nowIso();
  const leaseUntil = new Date(Date.now() + safeLeaseMs).toISOString();
  const candidates = deps.listPendingOutboxEventsStmt.all(now, safeLimit) as OutboxEventRow[];
  const claimed: OutboxEventRow[] = [];

  for (const event of candidates) {
    const result = deps.claimOutboxEventStmt.run(leaseUntil, event.id, now) as { changes?: number };
    if ((result.changes ?? 0) > 0) {
      claimed.push(event);
    }
  }

  return claimed;
}

export function markOutboxPublishedInDb(deps: OutboxDeps, eventId: string): void {
  deps.markOutboxPublishedStmt.run(deps.nowIso(), eventId);
}

export function markOutboxRetryInDb(
  deps: OutboxDeps,
  eventId: string,
  nextAttemptAt: string,
  lastError: string,
): void {
  deps.markOutboxRetryStmt.run(nextAttemptAt, lastError, eventId);
}

export function markOutboxDeadLetterInDb(
  deps: OutboxDeps,
  eventId: string,
  lastError: string,
): void {
  deps.markOutboxDeadLetterStmt.run(deps.nowIso(), lastError, eventId);
}

export function getOutboxStatusFromDb(deps: OutboxDeps): OutboxStatus {
  const now = deps.nowIso();
  const row = deps.getOutboxStatusStmt.get(now, now) as
    | {
        readyCount?: number;
        retryScheduledCount?: number;
        deadLetterCount?: number;
        oldestPendingCreatedAt?: string | null;
      }
    | undefined;

  return {
    readyCount: row?.readyCount ?? 0,
    retryScheduledCount: row?.retryScheduledCount ?? 0,
    deadLetterCount: row?.deadLetterCount ?? 0,
    oldestPendingCreatedAt: row?.oldestPendingCreatedAt ?? null,
  };
}
