PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  display_name TEXT,
  is_anonymous INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  color TEXT NOT NULL,
  default_priority TEXT NOT NULL,
  estimated_duration_min INTEGER,
  active INTEGER NOT NULL,
  sort_order INTEGER NOT NULL,
  lane_code TEXT NOT NULL CHECK (lane_code GLOB '[A-Z]')
);

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  can_wait INTEGER NOT NULL,
  can_treat INTEGER NOT NULL,
  can_check_in INTEGER NOT NULL,
  staff_only INTEGER NOT NULL,
  public_name TEXT,
  active INTEGER NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS queues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  home_location_id TEXT,
  type TEXT NOT NULL,
  sort_policy TEXT NOT NULL,
  call_policy TEXT NOT NULL,
  default_movement_mode TEXT NOT NULL,
  active INTEGER NOT NULL,
  sort_order INTEGER NOT NULL,
  FOREIGN KEY(home_location_id) REFERENCES locations(id)
);

CREATE TABLE IF NOT EXISTS surfaces (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  audience TEXT NOT NULL,
  shows_queue INTEGER NOT NULL,
  supports_calling INTEGER NOT NULL,
  supports_confirmation INTEGER NOT NULL,
  supports_redirect INTEGER NOT NULL,
  enabled INTEGER NOT NULL,
  FOREIGN KEY(location_id) REFERENCES locations(id)
);

CREATE TABLE IF NOT EXISTS surface_display_rules (
  id TEXT PRIMARY KEY,
  surface_id TEXT NOT NULL,
  queue_id TEXT,
  location_id TEXT,
  topic_id TEXT,
  display_mode TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(surface_id) REFERENCES surfaces(id),
  FOREIGN KEY(queue_id) REFERENCES queues(id),
  FOREIGN KEY(location_id) REFERENCES locations(id),
  FOREIGN KEY(topic_id) REFERENCES topics(id)
);

CREATE TABLE IF NOT EXISTS journey_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  topic_id TEXT,
  active INTEGER NOT NULL,
  FOREIGN KEY(topic_id) REFERENCES topics(id)
);

CREATE TABLE IF NOT EXISTS journey_steps (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  target_location_id TEXT,
  queue_id TEXT,
  movement_mode TEXT NOT NULL,
  public_display_mode TEXT NOT NULL,
  completed_when TEXT NOT NULL,
  instruction_text TEXT,
  FOREIGN KEY(template_id) REFERENCES journey_templates(id),
  FOREIGN KEY(target_location_id) REFERENCES locations(id),
  FOREIGN KEY(queue_id) REFERENCES queues(id)
);

CREATE TABLE IF NOT EXISTS routing_rules (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  name TEXT NOT NULL,
  initial_last_known_location_id TEXT,
  initial_target_location_id TEXT,
  initial_queue_id TEXT,
  initial_movement_mode TEXT NOT NULL,
  initial_location_confidence TEXT NOT NULL,
  public_display_mode TEXT NOT NULL,
  terminal_instruction_template TEXT NOT NULL,
  requires_reception_confirmation INTEGER NOT NULL, -- FUTURE: Schließanlage/Gate, derzeit ungenutzt
  escort_policy TEXT NOT NULL,
  allow_redirect INTEGER NOT NULL,
  allowed_surface_ids TEXT,
  journey_template_id TEXT,
  active INTEGER NOT NULL,
  FOREIGN KEY(topic_id) REFERENCES topics(id),
  FOREIGN KEY(initial_last_known_location_id) REFERENCES locations(id),
  FOREIGN KEY(initial_target_location_id) REFERENCES locations(id),
  FOREIGN KEY(initial_queue_id) REFERENCES queues(id),
  FOREIGN KEY(journey_template_id) REFERENCES journey_templates(id)
);

CREATE TABLE IF NOT EXISTS visits (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  status TEXT NOT NULL,
  primary_topic_id TEXT,
  applied_routing_rule_id TEXT,
  last_known_location_id TEXT,
  target_location_id TEXT,
  queue_id TEXT,
  last_surface_id TEXT,
  movement_mode TEXT NOT NULL,
  location_confidence TEXT NOT NULL,
  public_display_mode TEXT NOT NULL,
  queue_number TEXT NOT NULL,
  queue_number_date TEXT NOT NULL,
  queue_number_scope TEXT NOT NULL,
  queue_lane_code TEXT NOT NULL,
  queue_sequence INTEGER NOT NULL,
  needs_assistance INTEGER NOT NULL,
  check_in_path TEXT NOT NULL DEFAULT 'topic' CHECK (check_in_path IN ('topic', 'mfa_assist')),
  auth_path TEXT NOT NULL DEFAULT 'phone_dob' CHECK (auth_path IN ('phone_dob', 'name_dob', 'egk', 'none')),
  configured_escort_policy TEXT NOT NULL,
  effective_escort_policy TEXT NOT NULL,
  allow_redirect INTEGER NOT NULL,
  terminal_instruction TEXT NOT NULL,
  staff_note TEXT,
  checked_in_at TEXT,
  called_at TEXT,
  arrived_at TEXT,
  started_at TEXT,
  finished_at TEXT,
  journey_template_id TEXT,
  journey_step_index INTEGER,
  journey_step_completed_at TEXT,
  journey_state TEXT,
  supersedes_visit_id TEXT,
  superseded_by_visit_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(patient_id) REFERENCES patients(id),
  FOREIGN KEY(primary_topic_id) REFERENCES topics(id),
  FOREIGN KEY(applied_routing_rule_id) REFERENCES routing_rules(id),
  FOREIGN KEY(last_known_location_id) REFERENCES locations(id),
  FOREIGN KEY(target_location_id) REFERENCES locations(id),
  FOREIGN KEY(queue_id) REFERENCES queues(id),
  FOREIGN KEY(last_surface_id) REFERENCES surfaces(id),
  FOREIGN KEY(journey_template_id) REFERENCES journey_templates(id),
  UNIQUE (queue_number_date, queue_lane_code, queue_sequence)
);

CREATE TABLE IF NOT EXISTS visit_topics (
  id TEXT PRIMARY KEY,
  visit_id TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  is_primary INTEGER NOT NULL,
  status TEXT NOT NULL,
  FOREIGN KEY(visit_id) REFERENCES visits(id),
  FOREIGN KEY(topic_id) REFERENCES topics(id)
);

CREATE TABLE IF NOT EXISTS daily_queue_counters (
  scope TEXT NOT NULL,
  counter_date TEXT NOT NULL,
  next_value INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (scope, counter_date)
);

CREATE TABLE IF NOT EXISTS visit_events (
  id TEXT PRIMARY KEY,
  visit_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  from_location_id TEXT,
  to_location_id TEXT,
  from_location_name TEXT,
  to_location_name TEXT,
  from_queue_id TEXT,
  to_queue_id TEXT,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  note TEXT,
  correlation_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(visit_id) REFERENCES visits(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS visit_events_visit_sequence_uq
  ON visit_events (visit_id, sequence);
