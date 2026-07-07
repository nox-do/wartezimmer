-- Host-side journey template storage for complex routing (Paket 5).
ALTER TABLE ops_settings ADD COLUMN journey_settings_json TEXT NOT NULL DEFAULT '{"templates":[]}';
