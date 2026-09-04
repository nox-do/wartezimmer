import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { EMPTY_JOURNEY_SETTINGS, type JourneySettings } from '../journey-settings.js';
import { ensureFlowCoreSchema } from '../flow-core/flow-core-schema.js';
import {
  countOpenVisitsForJourneyTemplate,
  validateJourneySettingsEditable,
} from './journey-template-guard.js';

const TEMPLATE_ID = 'journey_labor';

function openDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  ensureFlowCoreSchema(db);
  return db;
}

function sampleTemplate(overrides: Partial<JourneySettings['templates'][number]> = {}) {
  return {
    id: TEMPLATE_ID,
    name: 'Labor',
    topicId: null,
    active: true,
    steps: [
      {
        id: 'step-1',
        sortOrder: 0,
        targetLocationId: 'empfang',
        queueId: null,
        movementMode: 'call',
        publicDisplayMode: 'visible',
        completedWhen: 'arrive',
        instructionText: null,
      },
    ],
    ...overrides,
  };
}

function insertOpenVisitForTemplate(
  db: DatabaseSync,
  templateId: string,
  journeyState: 'active' | 'abandoned' | 'completed' = 'active',
): void {
  db.exec('PRAGMA foreign_keys = OFF');
  db.prepare('INSERT INTO patients VALUES (?, ?, ?, ?)').run(
    'p1',
    null,
    1,
    '2026-07-07T10:00:00.000Z',
  );
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
      ?, 0, ?, '2026-07-07T10:00:00.000Z', '2026-07-07T10:00:00.000Z'
    )`,
  ).run(templateId, journeyState);
  db.exec('PRAGMA foreign_keys = ON');
}

test('countOpenVisitsForJourneyTemplate returns 0 without matching visits', () => {
  const db = openDb();
  assert.equal(countOpenVisitsForJourneyTemplate(db, TEMPLATE_ID), 0);
});

test('countOpenVisitsForJourneyTemplate counts non-terminal visits on template', () => {
  const db = openDb();
  insertOpenVisitForTemplate(db, TEMPLATE_ID);
  assert.equal(countOpenVisitsForJourneyTemplate(db, TEMPLATE_ID), 1);
});

test('countOpenVisitsForJourneyTemplate ignores abandoned open visits', () => {
  const db = openDb();
  insertOpenVisitForTemplate(db, TEMPLATE_ID, 'abandoned');
  assert.equal(countOpenVisitsForJourneyTemplate(db, TEMPLATE_ID), 0);
});

test('validateJourneySettingsEditable allows edits when only abandoned visits remain', () => {
  const db = openDb();
  insertOpenVisitForTemplate(db, TEMPLATE_ID, 'abandoned');
  const current: JourneySettings = { templates: [sampleTemplate()] };
  const next: JourneySettings = { templates: [sampleTemplate({ name: 'Labor neu' })] };
  assert.deepEqual(validateJourneySettingsEditable(db, current, next), { ok: true });
});

test('validateJourneySettingsEditable allows unchanged templates with open visits', () => {
  const db = openDb();
  insertOpenVisitForTemplate(db, TEMPLATE_ID);
  const current: JourneySettings = { templates: [sampleTemplate()] };
  assert.deepEqual(validateJourneySettingsEditable(db, current, current), { ok: true });
});

test('validateJourneySettingsEditable blocks template edits with open visits', () => {
  const db = openDb();
  insertOpenVisitForTemplate(db, TEMPLATE_ID);
  const current: JourneySettings = { templates: [sampleTemplate()] };
  const next: JourneySettings = { templates: [sampleTemplate({ name: 'Labor neu' })] };
  const result = validateJourneySettingsEditable(db, current, next);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'JOURNEY_TEMPLATE_LOCKED');
    assert.equal(result.templateId, TEMPLATE_ID);
    assert.equal(result.openVisitCount, 1);
  }
});

test('validateJourneySettingsEditable blocks template removal with open visits', () => {
  const db = openDb();
  insertOpenVisitForTemplate(db, TEMPLATE_ID);
  const current: JourneySettings = { templates: [sampleTemplate()] };
  const result = validateJourneySettingsEditable(db, current, EMPTY_JOURNEY_SETTINGS);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'JOURNEY_TEMPLATE_LOCKED');
    assert.equal(result.templateId, TEMPLATE_ID);
  }
});

test('validateJourneySettingsEditable allows edits when no open visits remain', () => {
  const db = openDb();
  const current: JourneySettings = { templates: [sampleTemplate()] };
  const next: JourneySettings = { templates: [sampleTemplate({ name: 'Labor neu' })] };
  assert.deepEqual(validateJourneySettingsEditable(db, current, next), { ok: true });
});
