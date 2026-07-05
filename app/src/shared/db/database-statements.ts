import type { DatabaseSync, StatementSync } from 'node:sqlite';

export type CoreDatabaseStatements = {
  findTicketByCodeStmt: StatementSync;
  getNextTicketNumberStmt: StatementSync;
  insertTicketStmt: StatementSync;
  insertQueueEntryStmt: StatementSync;
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
  deleteAllTicketsStmt: StatementSync;
  deleteAllOutboxEventsStmt: StatementSync;
  countAllOutboxEventsStmt: StatementSync;
  clearEmergencyStateStmt: StatementSync;
  countAllTicketsStmt: StatementSync;
  countTicketsByBusinessDayStmt: StatementSync;
  maxWaitMsByBusinessDayStmt: StatementSync;
  topicCountsByBusinessDayStmt: StatementSync;
  listOpenTicketsByBusinessDayStmt: StatementSync;
  listQueueStmt: StatementSync;
  listExpiredRecallWindowsStmt: StatementSync;
  listAbsenceLookupTicketsStmt: StatementSync;
  queueSummaryStmt: StatementSync;
  getTicketByIdStmt: StatementSync;
  getTicketDetailStmt: StatementSync;
  getTicketIdentityViewStmt: StatementSync;
  getTicketPortalContextStmt: StatementSync;
  updateTicketCalledStmt: StatementSync;
  updateQueueCalledStmt: StatementSync;
  updateTicketStatusStmt: StatementSync;
  updateTicketIdentityRefStmt: StatementSync;
  updateQueueReturnUntilStmt: StatementSync;
  updateQueueCallbackPhoneStmt: StatementSync;
  updateQueueRecallNotifyErrorStmt: StatementSync;
  updateQueueRecallNotifySentStmt: StatementSync;
  updateQueueTriageLevelStmt: StatementSync;
  clearQueueRoomStmt: StatementSync;
  insertOutboxEventStmt: StatementSync;
  listPendingOutboxEventsStmt: StatementSync;
  claimOutboxEventStmt: StatementSync;
  markOutboxPublishedStmt: StatementSync;
  markOutboxRetryStmt: StatementSync;
  markOutboxDeadLetterStmt: StatementSync;
  getOutboxStatusStmt: StatementSync;
  insertPatientSessionStmt: StatementSync;
  expireActiveSessionsByTicketStmt: StatementSync;
  getActiveSessionByTicketStmt: StatementSync;
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
  listDocumentsByTicketStmt: StatementSync;
};

export function prepareCoreDatabaseStatements(db: DatabaseSync): CoreDatabaseStatements {
  return {
    findTicketByCodeStmt: db.prepare(
      `SELECT v.id, v.status
      FROM visits v
      WHERE v.queue_number_date = ? AND v.queue_lane_code = ? AND v.queue_sequence = ?
      ORDER BY v.created_at DESC
      LIMIT 1`,
    ),
    getNextTicketNumberStmt: db.prepare(
      'SELECT COALESCE(MAX(number), 0) + 1 AS next_number FROM tickets WHERE business_day = ? AND lane_code = ?',
    ),
    insertTicketStmt: db.prepare(
      `INSERT INTO tickets (
        id, business_day, lane_code, number, topic_id, topic_label, destination_room_id, destination_room_label, auth_path, identity_ref, checkin_phone, checkin_locale, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    getTicketPortalContextStmt: db.prepare(
      `SELECT auth_path AS authPath, checkin_phone AS checkinPhone
      FROM tickets
      WHERE id = ?
      LIMIT 1`,
    ),
    insertQueueEntryStmt: db.prepare(
      'INSERT INTO queue_entries (ticket_id, arrived_at) VALUES (?, ?)',
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
    deleteAllTicketsStmt: db.prepare('DELETE FROM tickets'),
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
    countAllTicketsStmt: db.prepare('SELECT COUNT(1) AS count FROM tickets'),
    countTicketsByBusinessDayStmt: db.prepare(
      'SELECT COUNT(1) AS count FROM tickets WHERE business_day = ?',
    ),
    maxWaitMsByBusinessDayStmt: db.prepare(
      `SELECT MAX(
        CAST((unixepoch(q.called_at) - unixepoch(q.arrived_at)) * 1000 AS INTEGER)
      ) AS maxWaitMs
      FROM tickets t
      INNER JOIN queue_entries q ON q.ticket_id = t.id
      WHERE t.business_day = ?
        AND q.called_at IS NOT NULL`,
    ),
    topicCountsByBusinessDayStmt: db.prepare(
      `SELECT
        topic_id AS topicId,
        topic_label AS topicLabel,
        COUNT(1) AS count
      FROM tickets
      WHERE business_day = ?
      GROUP BY topic_id, topic_label
      ORDER BY count DESC, topic_label ASC`,
    ),
    listOpenTicketsByBusinessDayStmt: db.prepare(
      `SELECT
        id AS ticketId,
        lane_code AS laneCode,
        number,
        topic_label AS topicLabel,
        identity_ref AS identityRef,
        status
      FROM tickets
      WHERE business_day = ?
        AND status IN (
          'waiting',
          'called',
          'in_room',
          'absent_wait_here',
          'absent_return_later'
        )
      ORDER BY created_at ASC`,
    ),
    listQueueStmt: db.prepare(
      `SELECT
        t.id,
        t.lane_code AS laneCode,
        t.number,
        t.topic_id AS topicId,
        t.topic_label AS topicLabel,
        t.destination_room_id AS destinationRoomId,
        t.destination_room_label AS destinationRoomLabel,
        t.status,
        t.created_at AS createdAt,
        q.called_at AS calledAt,
        t.identity_ref AS identityRef,
        t.checkin_phone AS checkinPhone,
        q.room_id AS roomId,
        q.room_label AS roomLabel,
        q.callback_phone AS callbackPhone,
        q.recall_notify_error_code AS recallNotifyErrorCode,
        q.recall_notify_sent AS recallNotifySent,
        q.return_until AS returnUntil,
        q.triage_level AS triageLevel,
        COALESCE(doc.pendingCount, 0) AS documentCount
      FROM tickets t
      JOIN queue_entries q ON q.ticket_id = t.id
      LEFT JOIN (
        SELECT ticket_id, COUNT(1) AS pendingCount
        FROM documents
        WHERE status IN ('scan_clean', 'preview_requested', 'export_requested')
        GROUP BY ticket_id
      ) doc ON doc.ticket_id = t.id
      WHERE t.business_day = ?
        AND t.status IN (
          'waiting',
          'called',
          'in_room',
          'absent_wait_here',
          'absent_return_later'
        )
      ORDER BY t.created_at ASC`,
    ),
    listExpiredRecallWindowsStmt: db.prepare(
      `SELECT
        t.id AS id,
        q.return_until AS returnUntil
      FROM tickets t
      JOIN queue_entries q ON q.ticket_id = t.id
      WHERE t.business_day = ?
        AND t.status = 'absent_return_later'
        AND q.return_until IS NOT NULL
        AND q.return_until <= ?`,
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
    queueSummaryStmt: db.prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN status = 'waiting' THEN 1 ELSE 0 END), 0) AS waitingNow,
        COALESCE(SUM(CASE WHEN status = 'called' THEN 1 ELSE 0 END), 0) AS calledNow,
        COALESCE(SUM(CASE WHEN status = 'in_room' THEN 1 ELSE 0 END), 0) AS inRoomNow,
        COALESCE(
          SUM(
            CASE
              WHEN status IN ('absent_wait_here', 'absent_return_later') THEN 1
              ELSE 0
            END
          ),
          0
        ) AS absentNow,
        COALESCE(
          SUM(CASE WHEN business_day = ? AND status = 'done' THEN 1 ELSE 0 END),
          0
        ) AS processedToday
      FROM tickets
      WHERE business_day = ?`,
    ),
    getTicketByIdStmt: db.prepare(
      `SELECT
        id,
        status,
        topic_id AS topicId,
        destination_room_id AS destinationRoomId,
        destination_room_label AS destinationRoomLabel
      FROM tickets
      WHERE id = ?
      LIMIT 1`,
    ),
    getTicketDetailStmt: db.prepare(
      `SELECT
        t.id,
        t.status,
        t.updated_at AS updatedAt,
        t.checkin_phone AS checkinPhone,
        t.checkin_locale AS checkinLocale,
        q.return_until AS returnUntil,
        q.callback_phone AS callbackPhone,
        q.recall_notify_error_code AS recallNotifyErrorCode,
        q.recall_notify_sent AS recallNotifySent
      FROM tickets t
      JOIN queue_entries q ON q.ticket_id = t.id
      WHERE t.id = ?
      LIMIT 1`,
    ),
    getTicketIdentityViewStmt: db.prepare(
      `SELECT
        id AS ticketId,
        lane_code AS laneCode,
        number,
        topic_id AS topicId,
        topic_label AS topicLabel,
        auth_path AS authPath,
        identity_ref AS identityRef,
        status,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM tickets
      WHERE id = ?
      LIMIT 1`,
    ),
    updateTicketCalledStmt: db.prepare(
      'UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?',
    ),
    updateQueueCalledStmt: db.prepare(
      'UPDATE queue_entries SET called_at = ?, room_id = ?, room_label = ?, return_until = NULL, callback_phone = NULL, recall_notify_error_code = NULL, recall_notify_sent = 0 WHERE ticket_id = ?',
    ),
    updateTicketStatusStmt: db.prepare(
      'UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?',
    ),
    updateTicketIdentityRefStmt: db.prepare(
      'UPDATE tickets SET identity_ref = ?, updated_at = ? WHERE id = ?',
    ),
    updateQueueReturnUntilStmt: db.prepare(
      'UPDATE queue_entries SET return_until = ? WHERE ticket_id = ?',
    ),
    updateQueueCallbackPhoneStmt: db.prepare(
      'UPDATE queue_entries SET callback_phone = ? WHERE ticket_id = ?',
    ),
    updateQueueRecallNotifyErrorStmt: db.prepare(
      'UPDATE queue_entries SET recall_notify_error_code = ? WHERE ticket_id = ?',
    ),
    updateQueueRecallNotifySentStmt: db.prepare(
      'UPDATE queue_entries SET recall_notify_sent = ? WHERE ticket_id = ?',
    ),
    updateQueueTriageLevelStmt: db.prepare(
      'UPDATE queue_entries SET triage_level = ? WHERE ticket_id = ?',
    ),
    clearQueueRoomStmt: db.prepare(
      'UPDATE queue_entries SET room_id = NULL, room_label = NULL, return_until = NULL, recall_notify_error_code = NULL, recall_notify_sent = 0 WHERE ticket_id = ?',
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
      `INSERT INTO patient_sessions (id, ticket_id, token_hash, status, expires_at, last_seen_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
    ),
    expireActiveSessionsByTicketStmt: db.prepare(
      "UPDATE patient_sessions SET status = 'revoked', updated_at = ? WHERE ticket_id = ? AND status = 'active'",
    ),
    getActiveSessionByTicketStmt: db.prepare(
      `SELECT id
      FROM patient_sessions
      WHERE ticket_id = ? AND status = 'active' AND expires_at > ?
      LIMIT 1`,
    ),
    getPatientSessionByTokenStmt: db.prepare(
      `SELECT id AS sessionId, ticket_id AS ticketId, expires_at AS expiresAt, status, created_at AS createdAt
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
        id, ticket_id, session_id, source, file_name, mime_type, size_bytes, status, template_id, template_version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    listPatientDocumentsStmt: db.prepare(
      `SELECT
        id,
        ticket_id AS ticketId,
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
        ticket_id AS ticketId,
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
        d.ticket_id AS ticketId,
        t.lane_code AS ticketLaneCode,
        t.number AS ticketNumber,
        t.identity_ref AS identityRef,
        d.file_name AS fileName,
        d.mime_type AS mimeType,
        d.source AS source,
        d.status AS status
      FROM documents d
      JOIN tickets t ON t.id = d.ticket_id
      WHERE d.id = ?
      LIMIT 1`,
    ),
    updateDocumentStatusStmt: db.prepare(
      'UPDATE documents SET status = ?, updated_at = ? WHERE id = ?',
    ),
    updateDocumentFileNameStmt: db.prepare(
      'UPDATE documents SET file_name = ?, updated_at = ? WHERE id = ?',
    ),
    listDocumentsByTicketStmt: db.prepare(
      `SELECT
        id,
        ticket_id AS ticketId,
        session_id AS sessionId,
        source,
        file_name AS fileName,
        mime_type AS mimeType,
        size_bytes AS sizeBytes,
        status,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM documents
      WHERE ticket_id = ?
        AND status IN ('scan_clean', 'preview_requested', 'export_requested')
      ORDER BY created_at DESC`,
    ),
  };
}
