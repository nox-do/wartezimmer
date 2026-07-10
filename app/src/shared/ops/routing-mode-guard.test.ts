import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { validateRoutingModeChange, countOpenVisits } from './routing-mode-guard.js';
import { ensureFlowCoreSchema } from '../flow-core/flow-core-schema.js';

function openDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  ensureFlowCoreSchema(db);
  return db;
}

function insertVisit(db: DatabaseSync, id: string, status: string, journeyState: string | null = null, sequence = 1): void {
  db.exec('PRAGMA foreign_keys = OFF');
  db.prepare('INSERT INTO patients VALUES (?, ?, ?, ?)').run(`p-${id}`, null, 1, '2026-07-07T10:00:00.000Z');
  db.prepare(
    `INSERT INTO visits (
      id, patient_id, status, primary_topic_id, applied_routing_rule_id,
      last_known_location_id, target_location_id, queue_id, last_surface_id,
      movement_mode, location_confidence, public_display_mode, queue_number,
      queue_number_date, queue_number_scope, queue_lane_code, queue_sequence,
      needs_assistance, check_in_path, auth_path, configured_escort_policy,
      effective_escort_policy, allow_redirect, terminal_instruction, staff_note,
      checked_in_at, called_at, arrived_at, started_at, finished_at,
      journey_template_id, journey_step_index, journey_state, created_at, updated_at
    ) VALUES (
      ?, ?, ?, NULL, NULL,
      NULL, NULL, NULL, NULL,
      'call', 'assumed', 'visible', ?,
      '20260707', 'lane_day', 'L', ?,
      0, 'topic', 'phone_dob', 'none', 'none', 1, 'Bitte warten.', NULL,
      '2026-07-07T10:00:00.000Z', NULL, NULL, NULL, NULL,
      NULL, 0, ?, '2026-07-07T10:00:00.000Z', '2026-07-07T10:00:00.000Z'
    )`,
  ).run(id, `p-${id}`, status, id, sequence, journeyState);
  db.exec('PRAGMA foreign_keys = ON');
}

test('countOpenVisits returns 0 without open visits', () => {
  const db = openDb();
  assert.equal(countOpenVisits(db), 0);
});

test('countOpenVisits counts non-terminal visits regardless of journey_state', () => {
  const db = openDb();
  insertVisit(db, 'visit-1', 'waiting', null, 1);
  insertVisit(db, 'visit-2', 'arrived', null, 2);
  insertVisit(db, 'visit-3', 'done', null, 3);
  assert.equal(countOpenVisits(db), 2);
});

test('validateRoutingModeChange blocks simple to complex when waiting numbers are open', () => {
  const db = openDb();
  insertVisit(db, 'visit-1', 'waiting', null);
  const result = validateRoutingModeChange({
    currentMode: 'simple',
    nextMode: 'complex',
    db,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'ROUTING_MODE_CHANGE_BLOCKED');
    assert.equal(result.openVisitCount, 1);
  }
});

test('validateRoutingModeChange blocks complex to simple when waiting numbers are open', () => {
  const db = openDb();
  insertVisit(db, 'visit-1', 'called', null);
  const result = validateRoutingModeChange({
    currentMode: 'complex',
    nextMode: 'simple',
    db,
  });
  assert.equal(result.ok, false);
});

test('validateRoutingModeChange allows mode switch when no open waiting numbers', () => {
  const db = openDb();
  insertVisit(db, 'visit-1', 'done', 'active');
  assert.deepEqual(
    validateRoutingModeChange({ currentMode: 'simple', nextMode: 'complex', db }),
    { ok: true },
  );
  assert.deepEqual(
    validateRoutingModeChange({ currentMode: 'complex', nextMode: 'simple', db }),
    { ok: true },
  );
});

test('validateRoutingModeChange is no-op when mode unchanged', () => {
  const db = openDb();
  insertVisit(db, 'visit-1', 'waiting', null);
  assert.deepEqual(
    validateRoutingModeChange({ currentMode: 'complex', nextMode: 'complex', db }),
    { ok: true },
  );
});
