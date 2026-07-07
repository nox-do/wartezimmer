import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { validateRoutingModeChange, countActiveJourneyVisits } from './routing-mode-guard.js';
import { ensureFlowCoreSchema } from '../flow-core/flow-core-schema.js';

function openDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  ensureFlowCoreSchema(db);
  return db;
}

function insertActiveJourneyVisit(db: DatabaseSync): void {
  db.exec('PRAGMA foreign_keys = OFF');
  db.prepare('INSERT INTO patients VALUES (?, ?, ?, ?)').run('p1', null, 1, '2026-07-07T10:00:00.000Z');
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
      'visit-1', 'p1', 'waiting', NULL, NULL,
      NULL, NULL, NULL, NULL,
      'call', 'assumed', 'visible', 'L-001',
      '20260707', 'lane_day', 'L', 1,
      0, 'topic', 'phone_dob', 'none', 'none', 1, 'Bitte warten.', NULL,
      '2026-07-07T10:00:00.000Z', NULL, NULL, NULL, NULL,
      NULL, 0, 'active', '2026-07-07T10:00:00.000Z', '2026-07-07T10:00:00.000Z'
    )`,
  ).run();
  db.exec('PRAGMA foreign_keys = ON');
}

test('countActiveJourneyVisits returns 0 without active journeys', () => {
  const db = openDb();
  assert.equal(countActiveJourneyVisits(db), 0);
});

test('countActiveJourneyVisits counts non-terminal visits with journey_state active', () => {
  const db = openDb();
  insertActiveJourneyVisit(db);
  assert.equal(countActiveJourneyVisits(db), 1);
});

test('validateRoutingModeChange blocks simple to complex when journey is active', () => {
  const db = openDb();
  insertActiveJourneyVisit(db);
  const result = validateRoutingModeChange({
    currentMode: 'simple',
    nextMode: 'complex',
    db,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'ROUTING_MODE_CHANGE_BLOCKED');
    assert.equal(result.activeJourneyVisitCount, 1);
  }
});

test('validateRoutingModeChange blocks complex to simple when journey is active', () => {
  const db = openDb();
  insertActiveJourneyVisit(db);
  const result = validateRoutingModeChange({
    currentMode: 'complex',
    nextMode: 'simple',
    db,
  });
  assert.equal(result.ok, false);
});

test('validateRoutingModeChange allows mode switch when no active journey visits', () => {
  const db = openDb();
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
  insertActiveJourneyVisit(db);
  assert.deepEqual(
    validateRoutingModeChange({ currentMode: 'complex', nextMode: 'complex', db }),
    { ok: true },
  );
});
