import type { DatabaseSync } from 'node:sqlite';

export function prepareOpsDatabaseStatements(db: DatabaseSync) {
  return {
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
    clearEmergencyStateStmt: db.prepare(
      `UPDATE ops_state
      SET emergency_active = 0,
          emergency_id = NULL,
          emergency_raised_at = NULL,
          emergency_acknowledged_at = NULL,
          updated_at = ?
      WHERE id = 'singleton'`,
    ),
    getOpsSettingsStmt: db.prepare(
      `SELECT
        waiting_room_full AS waitingRoomFull,
        routing_mode AS routingMode,
        return_window_minutes AS returnWindowMinutes,
        practice_open_from AS practiceOpenFrom,
        practice_open_to AS practiceOpenTo,
        practice_profile_json AS practiceProfileJson,
        topic_settings_json AS topicSettingsJson,
        journey_settings_json AS journeySettingsJson,
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
          routing_mode = ?,
          return_window_minutes = ?,
          practice_open_from = ?,
          practice_open_to = ?,
          practice_profile_json = ?,
          topic_settings_json = ?,
          journey_settings_json = ?,
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
      FROM messaging_provider_configs
      ORDER BY provider_id`,
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
  };
}
