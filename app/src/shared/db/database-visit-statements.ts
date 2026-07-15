import type { DatabaseSync } from 'node:sqlite';

export function prepareVisitDatabaseStatements(db: DatabaseSync) {
  return {
    findTicketByCodeStmt: db.prepare(
      `SELECT v.id, v.status
      FROM visits v
      WHERE v.queue_number_date = ? AND v.queue_lane_code = ? AND v.queue_sequence = ?
        AND v.status NOT IN ('done', 'cancelled', 'no_show')
      ORDER BY v.created_at DESC
      LIMIT 1`,
    ),
    getVisitPortalContextStmt: db.prepare(
      `SELECT
        v.auth_path AS authPath,
        h.checkin_phone AS checkinPhone
      FROM visits v
      LEFT JOIN visit_host_state h ON h.visit_id = v.id
      WHERE v.id = ?
      LIMIT 1`,
    ),
    countAllVisitsStmt: db.prepare('SELECT COUNT(1) AS count FROM visits'),
    countVisitsByBusinessDayStmt: db.prepare(
      'SELECT COUNT(1) AS count FROM visits WHERE queue_number_date = ?',
    ),
    maxWaitMsByBusinessDayStmt: db.prepare(
      `SELECT MAX(
        CAST((unixepoch(called_at) - unixepoch(checked_in_at)) * 1000 AS INTEGER)
      ) AS maxWaitMs
      FROM visits
      WHERE queue_number_date = ?
        AND called_at IS NOT NULL
        AND checked_in_at IS NOT NULL`,
    ),
    topicCountsByBusinessDayStmt: db.prepare(
      `SELECT
        v.primary_topic_id AS topicId,
        COALESCE(top.name, v.primary_topic_id) AS topicLabel,
        COUNT(1) AS count
      FROM visits v
      LEFT JOIN topics top ON top.id = v.primary_topic_id
      WHERE v.queue_number_date = ?
      GROUP BY v.primary_topic_id, top.name
      ORDER BY count DESC, topicLabel ASC`,
    ),
    listOpenVisitsByBusinessDayStmt: db.prepare(
      `SELECT
        v.id AS visitId,
        v.queue_lane_code AS laneCode,
        v.queue_sequence AS number,
        COALESCE(top.name, v.primary_topic_id) AS topicLabel,
        COALESCE(h.identity_ref_override, p.display_name) AS identityRef,
        CASE
          WHEN h.absent_mode = 'wait_here' THEN 'absent_wait_here'
          WHEN h.absent_mode = 'return_later' THEN 'absent_return_later'
          WHEN v.status IN ('arrived', 'in_progress') THEN 'in_room'
          WHEN v.status = 'called' THEN 'called'
          WHEN v.status IN ('waiting', 'directed', 'blocked') THEN 'waiting'
          ELSE v.status
        END AS status
      FROM visits v
      LEFT JOIN patients p ON p.id = v.patient_id
      LEFT JOIN visit_host_state h ON h.visit_id = v.id
      LEFT JOIN topics top ON top.id = v.primary_topic_id
      WHERE v.queue_number_date = ?
        AND (
          v.status IN ('waiting', 'directed', 'called', 'arrived', 'in_progress', 'blocked')
          OR h.absent_mode IS NOT NULL
        )
      ORDER BY v.checked_in_at ASC`,
    ),
    listAbsenceLookupTicketsStmt: db.prepare(
      `SELECT
        v.id,
        v.queue_lane_code AS laneCode,
        v.queue_sequence AS number,
        v.status,
        COALESCE(h.identity_ref_override, p.display_name) AS identityRef,
        h.callback_phone AS callbackPhone,
        h.checkin_phone AS checkinPhone
      FROM visits v
      LEFT JOIN patients p ON p.id = v.patient_id
      LEFT JOIN visit_host_state h ON h.visit_id = v.id
      WHERE v.queue_number_date = ?
        AND v.status IN ('waiting', 'called')
      ORDER BY v.checked_in_at ASC`,
    ),
    getVisitIdentityViewStmt: db.prepare(
      `SELECT
        v.id AS visitId,
        v.queue_lane_code AS laneCode,
        v.queue_sequence AS number,
        v.primary_topic_id AS topicId,
        COALESCE(top.name, v.primary_topic_id) AS topicLabel,
        v.auth_path AS authPath,
        COALESCE(h.identity_ref_override, p.display_name) AS identityRef,
        CASE
          WHEN h.absent_mode = 'wait_here' THEN 'absent_wait_here'
          WHEN h.absent_mode = 'return_later' THEN 'absent_return_later'
          WHEN v.status IN ('arrived', 'in_progress') THEN 'in_room'
          WHEN v.status = 'called' THEN 'called'
          WHEN v.status IN ('waiting', 'directed', 'blocked') THEN 'waiting'
          WHEN v.status = 'done' THEN 'done'
          WHEN v.status IN ('cancelled', 'no_show') THEN 'cancelled'
          ELSE 'waiting'
        END AS status,
        COALESCE(v.checked_in_at, v.created_at) AS createdAt,
        v.updated_at AS updatedAt
      FROM visits v
      LEFT JOIN patients p ON p.id = v.patient_id
      LEFT JOIN visit_host_state h ON h.visit_id = v.id
      LEFT JOIN topics top ON top.id = v.primary_topic_id
      WHERE v.id = ?
      LIMIT 1`,
    ),
  };
}
