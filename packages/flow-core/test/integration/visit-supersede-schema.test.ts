import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { validateCatalogIntegrity } from '@wartezimmer/flow-core';
import {
  createRuntime,
  ensureVisitSupersedeColumns,
  loadCatalog,
  openDb,
} from '@wartezimmer/flow-core/server';
import { seedIfEmpty } from '../../src/server/seed.js';

const schemaPath = join(dirname(fileURLToPath(import.meta.url)), '../../db/schema.sql');

const LEGACY_VISITS_DDL = `
CREATE TABLE patients (
  id TEXT PRIMARY KEY,
  display_name TEXT,
  is_anonymous INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE visits (
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
  check_in_path TEXT NOT NULL DEFAULT 'topic',
  auth_path TEXT NOT NULL DEFAULT 'phone_dob',
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
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(patient_id) REFERENCES patients(id)
);
`;

function visitColumnNames(db: DatabaseSync): string[] {
  return (db.prepare('PRAGMA table_info(visits)').all() as Array<{ name?: string }>).map(
    (row) => row.name!,
  );
}

test('Supersede-Migration ergänzt Link-Spalten auf alter visits-Tabelle', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(LEGACY_VISITS_DDL);
  db.exec(`
    INSERT INTO patients VALUES ('patient-legacy', 'Legacy', 0, '2026-01-01T08:00:00.000Z');
    INSERT INTO visits VALUES (
      'visit-legacy', 'patient-legacy', 'waiting', NULL, NULL, NULL, NULL, NULL, NULL,
      'call', 'instructed', 'visible',
      'A-001', '2026-01-01', 'lane_day', 'A', 1,
      0, 'topic', 'phone_dob', 'none', 'none', 1,
      'Bitte warten.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
      '2026-01-01T08:00:00.000Z', '2026-01-01T08:00:00.000Z'
    );
  `);

  assert.equal(visitColumnNames(db).includes('supersedes_visit_id'), false);
  assert.equal(visitColumnNames(db).includes('superseded_by_visit_id'), false);

  ensureVisitSupersedeColumns(db);

  const columns = visitColumnNames(db);
  assert.ok(columns.includes('supersedes_visit_id'));
  assert.ok(columns.includes('superseded_by_visit_id'));

  const row = db
    .prepare('SELECT id, supersedes_visit_id, superseded_by_visit_id FROM visits WHERE id = ?')
    .get('visit-legacy') as {
    id: string;
    supersedes_visit_id: string | null;
    superseded_by_visit_id: string | null;
  };
  assert.equal(row.id, 'visit-legacy');
  assert.equal(row.supersedes_visit_id, null);
  assert.equal(row.superseded_by_visit_id, null);
});

test('openDb: Bestands-visits ohne Supersede-Spalten bleiben lesbar und supersede-fähig', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(LEGACY_VISITS_DDL);
  db.exec(`
    INSERT INTO patients VALUES ('patient-legacy', 'Legacy', 0, '2026-01-01T08:00:00.000Z');
    INSERT INTO visits VALUES (
      'visit-legacy', 'patient-legacy', 'waiting', NULL, NULL, NULL, NULL, NULL, NULL,
      'call', 'instructed', 'visible',
      'A-099', '2026-01-01', 'lane_day', 'A', 99,
      0, 'topic', 'phone_dob', 'none', 'none', 1,
      'Bitte warten.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
      '2026-01-01T08:00:00.000Z', '2026-01-01T08:00:00.000Z'
    );
  `);
  db.exec(readFileSync(schemaPath, 'utf8'));
  ensureVisitSupersedeColumns(db);
  seedIfEmpty(db);
  validateCatalogIntegrity(loadCatalog(db));

  const runtime = createRuntime(db);
  const legacy = runtime.visits().find((visit) => visit.id === 'visit-legacy');
  assert.ok(legacy);
  assert.equal(legacy?.supersedesVisitId, undefined);
  assert.equal(legacy?.supersededByVisitId, undefined);

  const mfa = runtime.checkIn({ mfaAssist: true, surfaceId: 'terminal_1' });
  const result = runtime.supersede(mfa!.id, { topicId: 'general' });
  assert.equal(result.visit.supersedesVisitId, mfa!.id);
  assert.equal(result.superseded.supersededByVisitId, result.visit.id);
});

test('openDb: frische DB hat Supersede-Spalten ohne erneute Migration', () => {
  const db = openDb({ path: ':memory:' });
  const columns = visitColumnNames(db);
  assert.ok(columns.includes('supersedes_visit_id'));
  assert.ok(columns.includes('superseded_by_visit_id'));
});
