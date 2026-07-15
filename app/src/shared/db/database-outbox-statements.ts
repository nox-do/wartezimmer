import type { DatabaseSync } from 'node:sqlite';

export function prepareOutboxDatabaseStatements(db: DatabaseSync) {
  return {
    deleteAllOutboxEventsStmt: db.prepare('DELETE FROM outbox_events'),
    countAllOutboxEventsStmt: db.prepare('SELECT COUNT(1) AS count FROM outbox_events'),
    insertOutboxEventStmt: db.prepare(
      'INSERT INTO outbox_events (id, event_type, aggregate_id, payload_json, created_at, published_at) VALUES (?, ?, ?, ?, ?, NULL)',
    ),
    listPendingOutboxEventsStmt: db.prepare(
      `SELECT
        id,
        event_type AS eventType,
        aggregate_id AS aggregateId,
        payload_json AS payloadJson,
        created_at AS createdAt,
        attempt_count AS attemptCount
      FROM outbox_events
      WHERE published_at IS NULL
        AND dead_lettered_at IS NULL
        AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
      ORDER BY created_at ASC, id ASC
      LIMIT ?`,
    ),
    claimOutboxEventStmt: db.prepare(
      `UPDATE outbox_events
      SET next_attempt_at = ?
      WHERE id = ?
        AND published_at IS NULL
        AND dead_lettered_at IS NULL
        AND (next_attempt_at IS NULL OR next_attempt_at <= ?)`,
    ),
    markOutboxPublishedStmt: db.prepare(
      `UPDATE outbox_events
      SET published_at = ?,
          next_attempt_at = NULL,
          last_error = NULL
      WHERE id = ?`,
    ),
    markOutboxRetryStmt: db.prepare(
      `UPDATE outbox_events
      SET attempt_count = attempt_count + 1,
          next_attempt_at = ?,
          last_error = ?
      WHERE id = ?`,
    ),
    markOutboxDeadLetterStmt: db.prepare(
      `UPDATE outbox_events
      SET attempt_count = attempt_count + 1,
          dead_lettered_at = ?,
          next_attempt_at = NULL,
          last_error = ?
      WHERE id = ?`,
    ),
    getOutboxStatusStmt: db.prepare(
      `SELECT
        COALESCE(
          SUM(
            CASE
              WHEN published_at IS NULL
                AND dead_lettered_at IS NULL
                AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS readyCount,
        COALESCE(
          SUM(
            CASE
              WHEN published_at IS NULL
                AND dead_lettered_at IS NULL
                AND next_attempt_at > ?
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS retryScheduledCount,
        COALESCE(SUM(CASE WHEN dead_lettered_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS deadLetterCount,
        MIN(
          CASE
            WHEN published_at IS NULL AND dead_lettered_at IS NULL THEN created_at
            ELSE NULL
          END
        ) AS oldestPendingCreatedAt
      FROM outbox_events`,
    ),
  };
}
