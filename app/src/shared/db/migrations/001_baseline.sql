-- praxis_flow schema baseline (2026-06): Wartezimmer / Patientenfluss
-- Fresh databases only. Schema change = delete SQLite file / Docker volume and restart (no in-place upgrades).
-- Phase B3: tickets/queue_entries removed; portal tables use visit_id (FK added at runtime via ensureVisitPortalSchema).

CREATE TABLE IF NOT EXISTS ops_state (
  id TEXT PRIMARY KEY,
  checkin_locked INTEGER NOT NULL DEFAULT 0,
  day_close_phase TEXT NOT NULL DEFAULT 'open' CHECK (day_close_phase IN ('open', 'started')),
  last_reset_business_day TEXT,
  emergency_active INTEGER NOT NULL DEFAULT 0,
  emergency_id TEXT,
  emergency_raised_at TEXT,
  emergency_acknowledged_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_settings (
  id TEXT PRIMARY KEY,
  staff_pin_hash_mfa TEXT NOT NULL,
  staff_pin_hash_ops TEXT NOT NULL,
  room_panel_pin_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO ops_state (id, checkin_locked, day_close_phase, last_reset_business_day, updated_at)
SELECT 'singleton', 0, 'open', date('now', 'localtime'), CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM ops_state WHERE id = 'singleton');

CREATE TABLE IF NOT EXISTS outbox_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  published_at TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_error TEXT,
  dead_lettered_at TEXT
);

CREATE TABLE IF NOT EXISTS patient_sessions (
  id TEXT PRIMARY KEY,
  visit_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('active', 'expired', 'revoked')),
  expires_at TEXT NOT NULL,
  last_seen_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  visit_id TEXT NOT NULL,
  session_id TEXT NOT NULL REFERENCES patient_sessions(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('upload', 'form')),
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  template_id TEXT,
  template_version INTEGER,
  status TEXT NOT NULL CHECK (
    status IN (
      'received',
      'scanning',
      'scan_clean',
      'blocked_malware',
      'scan_error',
      'preview_requested',
      'discarded_by_patient',
      'discarded_by_mfa',
      'export_requested',
      'exported'
    )
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ops_settings (
  id TEXT PRIMARY KEY,
  waiting_room_full INTEGER NOT NULL DEFAULT 0,
  routing_mode TEXT NOT NULL DEFAULT 'simple' CHECK (routing_mode IN ('simple', 'complex')),
  return_window_minutes INTEGER NOT NULL DEFAULT 15,
  practice_open_from TEXT NOT NULL DEFAULT '00:00',
  practice_open_to TEXT NOT NULL DEFAULT '23:59',
  topic_settings_json TEXT NOT NULL,
  journey_settings_json TEXT NOT NULL DEFAULT '{"templates":[]}',
  rooms_json TEXT NOT NULL,
  contact_lookup_folder_path TEXT,
  contact_lookup_delimiter_mode TEXT NOT NULL DEFAULT 'auto',
  contact_lookup_has_header INTEGER NOT NULL DEFAULT 1,
  contact_lookup_mapping_json TEXT NOT NULL DEFAULT '{"mobile":"mobil","firstName":"vorname","lastName":"nachname","birthDate":"geburtsdatum"}',
  emergency_enabled INTEGER NOT NULL DEFAULT 1,
  terminal_wlan_promo_enabled INTEGER NOT NULL DEFAULT 0,
  terminal_auth_phone_enabled INTEGER NOT NULL DEFAULT 1,
  terminal_auth_name_dob_enabled INTEGER NOT NULL DEFAULT 0,
  terminal_auth_egk_enabled INTEGER NOT NULL DEFAULT 0,
  terminal_patient_locales TEXT NOT NULL DEFAULT '["de-DE"]',
  sms_provider TEXT NOT NULL DEFAULT 'mock',
  export_base_path TEXT NOT NULL DEFAULT '/var/lib/praxis-flow/exports',
  practice_profile_json TEXT NOT NULL DEFAULT '{}',
  setup_completed_at TEXT,
  setup_last_step TEXT NOT NULL DEFAULT 'welcome',
  portal_enabled INTEGER NOT NULL DEFAULT 0,
  setup_contact_mode TEXT NOT NULL DEFAULT 'unset' CHECK (setup_contact_mode IN ('unset', 'sample', 'own')),
  updated_at TEXT NOT NULL
);

INSERT INTO ops_settings (
  id,
  waiting_room_full,
  routing_mode,
  return_window_minutes,
  practice_open_from,
  practice_open_to,
  topic_settings_json,
  journey_settings_json,
  rooms_json,
  contact_lookup_delimiter_mode,
  contact_lookup_has_header,
  contact_lookup_mapping_json,
  emergency_enabled,
  terminal_wlan_promo_enabled,
  terminal_auth_phone_enabled,
  terminal_auth_name_dob_enabled,
  terminal_auth_egk_enabled,
  terminal_patient_locales,
  sms_provider,
  export_base_path,
  practice_profile_json,
  setup_last_step,
  portal_enabled,
  setup_contact_mode,
  updated_at
)
SELECT
  'singleton',
  0,
  'simple',
  15,
  '00:00',
  '23:59',
  '[{"topicId":"blut","label":"Blutabnahme","laneCode":"L","defaultRoomId":"mfa-tresen","iconId":"droplet","enabled":true,"availableFrom":null,"availableTo":null,"sortOrder":1},{"topicId":"termin-habe","label":"Ich habe einen Termin","laneCode":"A","defaultRoomId":"mfa-tresen","iconId":"calendar-check","enabled":true,"availableFrom":null,"availableTo":null,"sortOrder":2},{"topicId":"termin-brauche","label":"Ich brauche einen Termin","laneCode":"A","defaultRoomId":"mfa-tresen","iconId":"calendar-plus","enabled":true,"availableFrom":null,"availableTo":null,"sortOrder":3},{"topicId":"offen","label":"Offene Sprechstunde","laneCode":"O","defaultRoomId":"mfa-tresen","iconId":"clock","enabled":true,"availableFrom":null,"availableTo":null,"sortOrder":4},{"topicId":"rezept","label":"Rezept / Überweisung","laneCode":"R","defaultRoomId":"mfa-tresen","iconId":"pill","enabled":true,"availableFrom":null,"availableTo":null,"sortOrder":5}]',
  '{"templates":[]}',
  '[{"roomId":"mfa-tresen","roomLabel":"Empfang","enabled":true,"defaultCallTarget":true}]',
  'semicolon',
  1,
  '{"mobile":"mobil","firstName":"vorname","lastName":"nachname","birthDate":"geburtsdatum"}',
  1,
  0,
  1,
  0,
  0,
  '["de-DE"]',
  'mock',
  '/var/lib/praxis-flow/exports',
  '{}',
  'welcome',
  0,
  'unset',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM ops_settings WHERE id = 'singleton');

CREATE TABLE IF NOT EXISTS messaging_provider_configs (
  provider_id TEXT PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'messenger')),
  enabled INTEGER NOT NULL DEFAULT 0,
  credentials_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);

INSERT INTO messaging_provider_configs (provider_id, channel, enabled, credentials_json, updated_at)
SELECT 'mock', 'sms', 1, '{}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM messaging_provider_configs WHERE provider_id = 'mock');

INSERT INTO messaging_provider_configs (provider_id, channel, enabled, credentials_json, updated_at)
SELECT 'seven', 'sms', 0, '{}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM messaging_provider_configs WHERE provider_id = 'seven');

INSERT INTO messaging_provider_configs (provider_id, channel, enabled, credentials_json, updated_at)
SELECT 'seven_whatsapp', 'messenger', 0, '{}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM messaging_provider_configs WHERE provider_id = 'seven_whatsapp');

CREATE INDEX IF NOT EXISTS idx_outbox_events_created ON outbox_events(created_at);
CREATE INDEX IF NOT EXISTS idx_outbox_events_created_id ON outbox_events(created_at, id);
CREATE INDEX IF NOT EXISTS idx_outbox_pending_delivery
  ON outbox_events(published_at, dead_lettered_at, next_attempt_at, created_at, id);

CREATE INDEX IF NOT EXISTS idx_patient_sessions_visit ON patient_sessions(visit_id);
CREATE INDEX IF NOT EXISTS idx_patient_sessions_status_expires ON patient_sessions(status, expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_sessions_one_active_visit
  ON patient_sessions(visit_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_documents_visit ON documents(visit_id, created_at);
CREATE INDEX IF NOT EXISTS idx_documents_session ON documents(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status, created_at);

CREATE TRIGGER IF NOT EXISTS documents_template_metadata_insert_guard
BEFORE INSERT ON documents
FOR EACH ROW
WHEN (
  (NEW.source = 'form' AND (NEW.template_id IS NULL OR NEW.template_version IS NULL OR NEW.template_version < 1))
  OR
  (NEW.source != 'form' AND (NEW.template_id IS NOT NULL OR NEW.template_version IS NOT NULL))
)
BEGIN
  SELECT RAISE(ABORT, 'DOCUMENT_TEMPLATE_METADATA_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS documents_template_metadata_update_guard
BEFORE UPDATE ON documents
FOR EACH ROW
WHEN (
  (NEW.source = 'form' AND (NEW.template_id IS NULL OR NEW.template_version IS NULL OR NEW.template_version < 1))
  OR
  (NEW.source != 'form' AND (NEW.template_id IS NOT NULL OR NEW.template_version IS NOT NULL))
)
BEGIN
  SELECT RAISE(ABORT, 'DOCUMENT_TEMPLATE_METADATA_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS ops_settings_time_integrity_insert_guard
BEFORE INSERT ON ops_settings
FOR EACH ROW
WHEN (
  length(NEW.practice_open_from) != 5
  OR substr(NEW.practice_open_from, 3, 1) != ':'
  OR substr(NEW.practice_open_from, 1, 2) < '00'
  OR substr(NEW.practice_open_from, 1, 2) > '23'
  OR substr(NEW.practice_open_from, 4, 2) < '00'
  OR substr(NEW.practice_open_from, 4, 2) > '59'
  OR length(NEW.practice_open_to) != 5
  OR substr(NEW.practice_open_to, 3, 1) != ':'
  OR substr(NEW.practice_open_to, 1, 2) < '00'
  OR substr(NEW.practice_open_to, 1, 2) > '23'
  OR substr(NEW.practice_open_to, 4, 2) < '00'
  OR substr(NEW.practice_open_to, 4, 2) > '59'
)
BEGIN
  SELECT RAISE(ABORT, 'OPS_SETTINGS_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS ops_settings_time_integrity_update_guard
BEFORE UPDATE ON ops_settings
FOR EACH ROW
WHEN (
  length(NEW.practice_open_from) != 5
  OR substr(NEW.practice_open_from, 3, 1) != ':'
  OR substr(NEW.practice_open_from, 1, 2) < '00'
  OR substr(NEW.practice_open_from, 1, 2) > '23'
  OR substr(NEW.practice_open_from, 4, 2) < '00'
  OR substr(NEW.practice_open_from, 4, 2) > '59'
  OR length(NEW.practice_open_to) != 5
  OR substr(NEW.practice_open_to, 3, 1) != ':'
  OR substr(NEW.practice_open_to, 1, 2) < '00'
  OR substr(NEW.practice_open_to, 1, 2) > '23'
  OR substr(NEW.practice_open_to, 4, 2) < '00'
  OR substr(NEW.practice_open_to, 4, 2) > '59'
)
BEGIN
  SELECT RAISE(ABORT, 'OPS_SETTINGS_INVALID');
END;
