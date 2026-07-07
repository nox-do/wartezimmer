import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createRuntime } from '@praxis-flow/flow-core/server';
import { ensureFlowCoreSchema } from './flow-core-schema.js';
import {
  PF_FLOW_LOC_WAITING,
  PF_FLOW_QUEUE_GENERAL,
  PF_FLOW_SURFACE_TERMINAL,
  PF_FLOW_SURFACE_TV,
  syncCatalogFromOpsSettings,
} from './sync-catalog-from-ops-settings.js';
import type { OpsSettings } from '../db/db-types.js';
import { DEFAULT_TERMINAL_TOPIC_DEFINITIONS } from '../checkin-topic-settings.js';

function sampleOpsSettings(): OpsSettings {
  return {
    routingMode: 'simple',
    returnWindowMinutes: 15,
    practiceOpenFrom: '08:00',
    practiceOpenTo: '18:00',
    practiceProfileJson: '{}',
    topics: DEFAULT_TERMINAL_TOPIC_DEFINITIONS,
    rooms: [
      {
        roomId: 'mfa-tresen',
        roomLabel: 'Empfang',
        enabled: true,
        defaultCallTarget: true,
        maxOccupancy: null,
      },
      {
        roomId: 'labor',
        roomLabel: 'Labor',
        enabled: true,
        defaultCallTarget: false,
        maxOccupancy: null,
        panel: {
          enabled: true,
          placement: 'outside',
          mode: 'arrival',
          showPatientNames: false,
          calledTextPreset: 'please_enter',
          calledTextCustom: null,
          arrivedTextPreset: 'please_wait_here',
          arrivedTextCustom: null,
        },
      },
    ],
    contactLookupFolderPath: null,
    contactLookupDelimiterMode: 'auto',
    contactLookupHasHeader: true,
    contactLookupMappingJson: '{}',
    emergencyEnabled: false,
    terminalWlanPromoEnabled: false,
    terminalAuthPhoneEnabled: true,
    terminalAuthNameDobEnabled: true,
    terminalAuthEgkEnabled: false,
    terminalPatientLocales: [],
    smsProvider: 'vonage',
    exportBasePath: '/tmp',
    updatedAt: '2026-07-04T12:00:00.000Z',
  };
}

function openTestFlowCoreDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  ensureFlowCoreSchema(db);
  return db;
}

test('syncCatalogFromOpsSettings maps PF topics and rooms into a valid flow-core catalog', () => {
  const db = openTestFlowCoreDb();
  const summary = syncCatalogFromOpsSettings(db, sampleOpsSettings());

  assert.ok(summary.topics >= DEFAULT_TERMINAL_TOPIC_DEFINITIONS.length);
  assert.equal(summary.queues, 1);
  assert.ok(summary.routingRules >= 1);
  assert.ok(summary.displayRules >= 2);

  const topicCount = (
    db.prepare('SELECT COUNT(*) AS count FROM topics WHERE active = 1').get() as { count: number }
  ).count;
  assert.ok(topicCount >= 1);

  const blutRule = db
    .prepare(
      'SELECT initial_target_location_id AS target, journey_template_id AS journeyTemplateId FROM routing_rules WHERE topic_id = ?',
    )
    .get('blut') as { target: string; journeyTemplateId: string | null } | undefined;
  assert.ok(blutRule);
  assert.equal(blutRule.target, 'mfa-tresen');
  assert.equal(blutRule.journeyTemplateId, null);

  const rezeptRule = db
    .prepare(
      'SELECT initial_target_location_id AS target, initial_movement_mode AS movementMode, public_display_mode AS displayMode FROM routing_rules WHERE topic_id = ?',
    )
    .get('rezept') as
    | { target: string; movementMode: string; displayMode: string }
    | undefined;
  assert.ok(rezeptRule);
  assert.equal(rezeptRule.target, 'mfa-tresen');
  assert.equal(rezeptRule.movementMode, 'call');
  assert.equal(rezeptRule.displayMode, 'visible');

  const tvRule = db
    .prepare('SELECT display_mode AS mode FROM surface_display_rules WHERE surface_id = ?')
    .get(PF_FLOW_SURFACE_TV) as { mode: string } | undefined;
  assert.equal(tvRule?.mode, 'visible');

  const waitingLocation = db
    .prepare('SELECT type FROM locations WHERE id = ?')
    .get(PF_FLOW_LOC_WAITING) as { type: string } | undefined;
  assert.equal(waitingLocation?.type, 'waiting_area');

  const generalQueue = db
    .prepare('SELECT home_location_id AS home FROM queues WHERE id = ?')
    .get(PF_FLOW_QUEUE_GENERAL) as { home: string } | undefined;
  assert.equal(generalQueue?.home, PF_FLOW_LOC_WAITING);
});

test('syncCatalogFromOpsSettings creates room panel surfaces for enabled panels', () => {
  const db = openTestFlowCoreDb();
  const summary = syncCatalogFromOpsSettings(db, sampleOpsSettings());

  const panelSurface = db
    .prepare('SELECT id FROM surfaces WHERE id = ?')
    .get('pf_panel_labor') as { id: string } | undefined;
  assert.ok(panelSurface);
  assert.equal(summary.surfaces, 4);
});

test('syncCatalogFromOpsSettings deactivates removed topics and routing rules instead of deleting them', () => {
  const db = openTestFlowCoreDb();
  const settings = sampleOpsSettings();
  syncCatalogFromOpsSettings(db, settings);

  const removedTopicId = 'rezept';
  syncCatalogFromOpsSettings(db, {
    ...settings,
    topics: settings.topics.filter((topic) => topic.topicId !== removedTopicId),
  });

  const topic = db.prepare('SELECT active FROM topics WHERE id = ?').get(removedTopicId) as
    | { active: number }
    | undefined;
  assert.equal(topic?.active, 0);

  const rule = db
    .prepare('SELECT active FROM routing_rules WHERE id = ?')
    .get(`rule_${removedTopicId}`) as { active: number } | undefined;
  assert.equal(rule?.active, 0);
});

test('syncCatalogFromOpsSettings deactivates removed room locations and panel surfaces instead of deleting them', () => {
  const db = openTestFlowCoreDb();
  const settings = sampleOpsSettings();
  syncCatalogFromOpsSettings(db, settings);

  syncCatalogFromOpsSettings(db, {
    ...settings,
    rooms: settings.rooms.filter((room) => room.roomId !== 'labor'),
  });

  const location = db.prepare('SELECT active FROM locations WHERE id = ?').get('labor') as
    | { active: number }
    | undefined;
  assert.equal(location?.active, 0);

  const panelSurface = db.prepare('SELECT enabled FROM surfaces WHERE id = ?').get('pf_panel_labor') as
    | { enabled: number }
    | undefined;
  assert.equal(panelSurface?.enabled, 0);

  const panelRule = db.prepare('SELECT id FROM surface_display_rules WHERE id = ?').get('panel_labor_target');
  assert.equal(panelRule, undefined);
});

test('syncCatalogFromOpsSettings rebuilds catalog inside a transaction with existing visits', () => {
  const db = openTestFlowCoreDb();
  const settings = sampleOpsSettings();
  syncCatalogFromOpsSettings(db, settings);

  const runtime = createRuntime(db, { resolveBusinessDay: () => '20260705' });
  runtime.checkIn({
    topicId: 'blut',
    authPath: 'phone_dob',
    surfaceId: PF_FLOW_SURFACE_TERMINAL,
  });

  db.exec('BEGIN');
  syncCatalogFromOpsSettings(db, {
    ...settings,
    topics: settings.topics.map((topic) =>
      topic.topicId === 'blut' ? { ...topic, label: 'Blutabnahme Labor' } : topic,
    ),
  });
  db.exec('COMMIT');

  const topic = db.prepare('SELECT name FROM topics WHERE id = ?').get('blut') as
    | { name: string }
    | undefined;
  assert.equal(topic?.name, 'Blutabnahme Labor');
  assert.equal(runtime.visits().length, 1);
});
