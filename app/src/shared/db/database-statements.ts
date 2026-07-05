import type { DatabaseSync, StatementSync } from 'node:sqlite';

export type CoreDatabaseStatements = {
  findTicketByCodeStmt: StatementSync;
  checkinLockStmt: StatementSync;
  dayCloseStateStmt: StatementSync;
  emergencyStateStmt: StatementSync;
  updateCheckinLockStmt: StatementSync;
  updateDayClosePhaseStmt: StatementSync;
  updateLastResetBusinessDayStmt: StatementSync;
  raiseEmergencyStmt: StatementSync;
  acknowledgeEmergencyStmt: StatementSync;
  getOpsSettingsStmt: StatementSync;
  updateOpsSettingsStmt: StatementSync;
  getAuthSettingsStmt: StatementSync;
  updateAuthPinHashStmt: StatementSync;
  listMessagingProviderConfigsStmt: StatementSync;
  getMessagingProviderConfigByIdStmt: StatementSync;
  upsertMessagingProviderConfigStmt: StatementSync;
  deleteAllOutboxEventsStmt: StatementSync;
  countAllOutboxEventsStmt: StatementSync;
  clearEmergencyStateStmt: StatementSync;
  countAllVisitsStmt: StatementSync;
  countVisitsByBusinessDayStmt: StatementSync;
  maxWaitMsByBusinessDayStmt: StatementSync;
  topicCountsByBusinessDayStmt: StatementSync;
  listOpenVisitsByBusinessDayStmt: StatementSync;
  listAbsenceLookupTicketsStmt: StatementSync;
  getTicketIdentityViewStmt: StatementSync;
  getTicketPortalContextStmt: StatementSync;
  insertOutboxEventStmt: StatementSync;
  listPendingOutboxEventsStmt: StatementSync;
  claimOutboxEventStmt: StatementSync;
  markOutboxPublishedStmt: StatementSync;
  markOutboxRetryStmt: StatementSync;
  markOutboxDeadLetterStmt: StatementSync;
  getOutboxStatusStmt: StatementSync;
  insertPatientSessionStmt: StatementSync;
  expireActiveSessionsByVisitStmt: StatementSync;
  getActiveSessionByVisitStmt: StatementSync;
  getPatientSessionByTokenStmt: StatementSync;
  touchPatientSessionStmt: StatementSync;
  expirePatientSessionStmt: StatementSync;
  revokePatientSessionStmt: StatementSync;
  insertDocumentStmt: StatementSync;
  listPatientDocumentsStmt: StatementSync;
  getSessionDocumentStmt: StatementSync;
  getDocumentByIdStmt: StatementSync;
  getDocumentExportInfoStmt: StatementSync;
  updateDocumentStatusStmt: StatementSync;
  updateDocumentFileNameStmt: StatementSync;
  listDocumentsByVisitStmt: StatementSync;
};

export function prepareCoreDatabaseStatements(db: DatabaseSync): CoreDatabaseStatements {
  return {
    findTicketByCodeStmt: db.prepare(
      `SELECT v.id, v.status
      FROM visits v
      WHERE v.queue_number_date = ? AND v.queue_lane_code = ? AND v.queue_sequence = ?
        AND v.status NOT IN ('done', 'cancelled', 'no_show')
      ORDER BY v.created_at DESC
      LIMIT 1`,
    ),
    getTicketPortalContextStmt: db.prepare(
      `SELECT
        v.auth_path AS authPath,
        h.checkin_phone AS checkinPhone
      FROM visits v
      LEFT JOIN visit_host_state h ON h.visit_id = v.id
      WHERE v.id = ?
      LIMIT 1`,
    ),
    checkinLockStmt: db.prepare(
      "SELECT checkin_locked AS locked FROM ops_state WHERE id = 'singleton' LIMIT 1",
    ),
    dayCloseStateStmt: db.prepare(
      `SELECT
        checkin_locked AS locked,
        day_close_phase AS phase,
        last_reset_business_day AS lastResetBusinessDay
      FROM ops_state
      WHERE id = 'singleton'
      LIMIT 1`,
    ),
    emergencyStateStmt: db.prepare(
      `SELECT
        checkin_locked AS locked,
        emergency_active AS active,
        emergency_id AS emergencyId,
        emergency_raised_at AS raisedAt,
        emergency_acknowledged_at AS acknowledgedAt
      FROM ops_state
      WHERE id = 'singleton'
      LIMIT 1`,
    ),
    updateCheckinLockStmt: db.prepare(
      "UPDATE ops_state SET checkin_locked = ?, updated_at = ? WHERE id = 'singleton'",
    ),
    updateDayClosePhaseStmt: db.prepare(
      "UPDATE ops_state SET day_close_phase = ?, updated_at = ? WHERE id = 'singleton'",
    ),
    updateLastResetBusinessDayStmt: db.prepare(
      "UPDATE ops_state SET last_reset_business_day = ?, updated_at = ? WHERE id = 'singleton'",
    ),
    raiseEmergencyStmt: db.prepare(
      `UPDATE ops_state
      SET emergency_active = 1,
          emergency_id = ?,
          emergency_raised_at = ?,
          emergency_acknowledged_at = NULL,
          updated_at = ?
      WHERE id = 'singleton'`,
    ),
    acknowledgeEmergencyStmt: db.prepare(
      `UPDATE ops_state
      SET emergency_active = 0,
          emergency_acknowledged_at = ?,
          updated_at = ?
      WHERE id = 'singleton'`,
    ),
    getOpsSettingsStmt: db.prepare(
      `SELECT
        waiting_room_full AS waitingRoomFull,
        return_window_minutes AS returnWindowMinutes,
        practice_open_from AS practiceOpenFrom,
        practice_open_to AS practiceOpenTo,
        practice_profile_json AS practiceProfileJson,
        topic_settings_json AS topicSettingsJson,
        rooms_json AS roomsJson,
        contact_lookup_folder_path AS contactLookupFolderPath,
        contact_lookup_delimiter_mode AS contactLookupDelimiterMode,
        contact_lookup_has_header AS contactLookupHasHeader,
        contact_lookup_mapping_json AS contactLookupMappingJson,
        emergency_enabled AS emergencyEnabled,
        terminal_wlan_promo_enabled AS terminalWlanPromoEnabled,
        terminal_auth_phone_enabled AS terminalAuthPhoneEnabled,
        terminal_auth_name_dob_enabled AS terminalAuthNameDobEnabled,
        terminal_auth_egk_enabled AS terminalAuthEgkEnabled,
        terminal_patient_locales AS terminalPatientLocales,
        sms_provider AS smsProvider,
        export_base_path AS exportBasePath,
        updated_at AS updatedAt
      FROM ops_settings
      WHERE id = 'singleton'
      LIMIT 1`,
    ),
    updateOpsSettingsStmt: db.prepare(
      `UPDATE ops_settings
      SET waiting_room_full = ?,
          return_window_minutes = ?,
          practice_open_from = ?,
          practice_open_to = ?,
          practice_profile_json = ?,
          topic_settings_json = ?,
          rooms_json = ?,
          contact_lookup_folder_path = ?,
          contact_lookup_delimiter_mode = ?,
          contact_lookup_has_header = ?,
          contact_lookup_mapping_json = ?,
          emergency_enabled = ?,
          terminal_wlan_promo_enabled = ?,
          terminal_auth_phone_enabled = ?,
          terminal_auth_name_dob_enabled = ?,
          terminal_auth_egk_enabled = ?,
          terminal_patient_locales = ?,
          sms_provider = ?,
          export_base_path = ?,
          updated_at = ?
      WHERE id = 'singleton'`,
    ),
    getAuthSettingsStmt: db.prepare(
      `SELECT
        staff_pin_hash_mfa AS staffPinHashMfa,
        staff_pin_hash_ops AS staffPinHashOps,
        room_panel_pin_hash AS roomPanelPinHash,
        updated_at AS updatedAt
      FROM auth_settings
      WHERE id = 'singleton'
      LIMIT 1`,
    ),
    updateAuthPinHashStmt: db.prepare(
      `UPDATE auth_settings
      SET staff_pin_hash_mfa = COALESCE(?, staff_pin_hash_mfa),
          staff_pin_hash_ops = COALESCE(?, staff_pin_hash_ops),
          room_panel_pin_hash = COALESCE(?, room_panel_pin_hash),
          updated_at = ?
      WHERE id = 'singleton'`,
    ),
    listMessagingProviderConfigsStmt: db.prepare(
      `SELECT
        provider_id AS providerId,
        channel,
        enabled,
        credentials_json AS credentialsJson,
        updated_at AS updatedAt
      FROM messaging_provider_configs`,
    ),
    getMessagingProviderConfigByIdStmt: db.prepare(
      `SELECT
        provider_id AS providerId,
        channel,
        enabled,
        credentials_json AS credentialsJson,
        updated_at AS updatedAt
      FROM messaging_provider_configs
      WHERE provider_id = ?
      LIMIT 1`,
    ),
    upsertMessagingProviderConfigStmt: db.prepare(
      `INSERT INTO messaging_provider_configs (
        provider_id, channel, enabled, credentials_json, updated_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(provider_id) DO UPDATE SET
        channel = excluded.channel,
        enabled = excluded.enabled,
        credentials_json = excluded.credentials_json,
        updated_at = excluded.updated_at`,
    ),
    deleteAllOutboxEventsStmt: db.prepare('DELETE FROM outbox_events'),
    countAllOutboxEventsStmt: db.prepare('SELECT COUNT(1) AS count FROM outbox_events'),
    clearEmergencyStateStmt: db.prepare(
      `UPDATE ops_state
      SET emergency_active = 0,
          emergency_id = NULL,
          emergency_raised_at = NULL,
          emergency_acknowledged_at = NULL,
          updated_at = ?
      WHERE id = 'singleton'`,
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
    getTicketIdentityViewStmt: db.prepare(
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
    insertPatientSessionStmt: db.prepare(
      `INSERT INTO patient_sessions (id, visit_id, token_hash, status, expires_at, last_seen_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
    ),
    expireActiveSessionsByVisitStmt: db.prepare(
      "UPDATE patient_sessions SET status = 'revoked', updated_at = ? WHERE visit_id = ? AND status = 'active'",
    ),
    getActiveSessionByVisitStmt: db.prepare(
      `SELECT id
      FROM patient_sessions
      WHERE visit_id = ? AND status = 'active' AND expires_at > ?
      LIMIT 1`,
    ),
    getPatientSessionByTokenStmt: db.prepare(
      `SELECT id AS sessionId, visit_id AS visitId, expires_at AS expiresAt, status, created_at AS createdAt
      FROM patient_sessions
      WHERE token_hash = ?
      LIMIT 1`,
    ),
    touchPatientSessionStmt: db.prepare(
      'UPDATE patient_sessions SET last_seen_at = ?, updated_at = ? WHERE id = ?',
    ),
    expirePatientSessionStmt: db.prepare(
      "UPDATE patient_sessions SET status = 'expired', updated_at = ? WHERE id = ?",
    ),
    revokePatientSessionStmt: db.prepare(
      "UPDATE patient_sessions SET status = 'revoked', updated_at = ? WHERE id = ?",
    ),
    insertDocumentStmt: db.prepare(
      `INSERT INTO documents (
        id, visit_id, session_id, source, file_name, mime_type, size_bytes, status, template_id, template_version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    listPatientDocumentsStmt: db.prepare(
      `SELECT
        id,
        visit_id AS visitId,
        file_name AS fileName,
        mime_type AS mimeType,
        size_bytes AS sizeBytes,
        status,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM documents
      WHERE session_id = ?
      ORDER BY created_at DESC`,
    ),
    getSessionDocumentStmt: db.prepare(
      'SELECT id, session_id AS sessionId, status FROM documents WHERE id = ? LIMIT 1',
    ),
    getDocumentByIdStmt: db.prepare(
      `SELECT
        id,
        visit_id AS visitId,
        session_id AS sessionId,
        source,
        file_name AS fileName,
        mime_type AS mimeType,
        size_bytes AS sizeBytes,
        status,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM documents
      WHERE id = ?
      LIMIT 1`,
    ),
    getDocumentExportInfoStmt: db.prepare(
      `SELECT
        d.id AS documentId,
        d.visit_id AS visitId,
        v.queue_lane_code AS ticketLaneCode,
        v.queue_sequence AS ticketNumber,
        COALESCE(h.identity_ref_override, p.display_name) AS identityRef,
        d.file_name AS fileName,
        d.mime_type AS mimeType,
        d.source AS source,
        d.status AS status
      FROM documents d
      JOIN visits v ON v.id = d.visit_id
      LEFT JOIN patients p ON p.id = v.patient_id
      LEFT JOIN visit_host_state h ON h.visit_id = v.id
      WHERE d.id = ?
      LIMIT 1`,
    ),
    updateDocumentStatusStmt: db.prepare(
      'UPDATE documents SET status = ?, updated_at = ? WHERE id = ?',
    ),
    updateDocumentFileNameStmt: db.prepare(
      'UPDATE documents SET file_name = ?, updated_at = ? WHERE id = ?',
    ),
    listDocumentsByVisitStmt: db.prepare(
      `SELECT
        id,
        visit_id AS visitId,
        session_id AS sessionId,
        source,
        file_name AS fileName,
        mime_type AS mimeType,
        size_bytes AS sizeBytes,
        status,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM documents
      WHERE visit_id = ?
        AND status IN ('scan_clean', 'preview_requested', 'export_requested')
      ORDER BY created_at DESC`,
    ),
  };
}
