import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { validateCatalogIntegrity } from '@praxis-flow/flow-core';
import { createRuntime, loadCatalog } from '@praxis-flow/flow-core/server';
import { normalizeRoomPanelsSettings } from '@praxis-flow/domain';
import { ensureFlowCoreSchema } from './flow-core-schema.js';
import {
  PF_FLOW_LOC_WAITING,
  PF_FLOW_QUEUE_GENERAL,
  PF_FLOW_SURFACE_MFA,
  PF_FLOW_SURFACE_TERMINAL,
  PF_FLOW_SURFACE_TV,
  buildSimpleRoutingRuleRow,
  isSimpleRoutingMode,
  syncCatalogFromOpsSettings,
} from './sync-catalog-from-ops-settings.js';
import type { OpsSettings } from '../db/db-types.js';
import { EMPTY_JOURNEY_SETTINGS } from '../journey-settings.js';
import {
  DEFAULT_TERMINAL_TOPIC_DEFINITIONS,
  MFA_ASSIST_TOPIC_ID,
} from '../checkin-topic-settings.js';
import { getFlowCoreRuntime } from './flow-core-runtime.js';

function sampleOpsSettings(): OpsSettings {
  return {
    routingMode: 'simple',
    returnWindowMinutes: 15,
    practiceOpenFrom: '08:00',
    practiceOpenTo: '18:00',
    practiceProfileJson: '{}',
    topics: DEFAULT_TERMINAL_TOPIC_DEFINITIONS,
    journeySettings: EMPTY_JOURNEY_SETTINGS,
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
        panels: normalizeRoomPanelsSettings({
          outside: {
            enabled: true,
            mode: 'arrival',
            showPatientNames: false,
            calledTextPreset: 'please_enter',
            calledTextCustom: null,
            arrivedTextPreset: 'please_wait_here',
            arrivedTextCustom: null,
          },
        }),
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
  assert.equal(summary.routingRules, 1 + DEFAULT_TERMINAL_TOPIC_DEFINITIONS.length);
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
    .get('rezept') as { target: string; movementMode: string; displayMode: string } | undefined;
  assert.ok(rezeptRule);
  assert.equal(rezeptRule.target, 'mfa-tresen');
  assert.equal(rezeptRule.movementMode, 'call');
  assert.equal(rezeptRule.displayMode, 'visible');

  const mfaRule = db
    .prepare(
      'SELECT initial_target_location_id AS target, allow_redirect AS allowRedirect, journey_template_id AS journeyTemplateId FROM routing_rules WHERE topic_id = ?',
    )
    .get(MFA_ASSIST_TOPIC_ID) as
    | { target: string; allowRedirect: number; journeyTemplateId: string | null }
    | undefined;
  assert.ok(mfaRule);
  assert.equal(mfaRule.target, 'mfa-tresen');
  assert.equal(mfaRule.allowRedirect, 0);
  assert.equal(mfaRule.journeyTemplateId, null);

  const mfaDashboard = db
    .prepare('SELECT type, supports_redirect AS supportsRedirect FROM surfaces WHERE id = ?')
    .get(PF_FLOW_SURFACE_MFA) as { type: string; supportsRedirect: number } | undefined;
  assert.equal(mfaDashboard?.type, 'dashboard');
  assert.equal(mfaDashboard?.supportsRedirect, 1);

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

  const panelSurface = db.prepare('SELECT id FROM surfaces WHERE id = ?').get('pf_panel_labor') as
    | { id: string }
    | undefined;
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

  const panelSurface = db
    .prepare('SELECT enabled FROM surfaces WHERE id = ?')
    .get('pf_panel_labor') as { enabled: number } | undefined;
  assert.equal(panelSurface?.enabled, 0);

  const panelRule = db
    .prepare('SELECT id FROM surface_display_rules WHERE id = ?')
    .get('panel_labor_target');
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

test('buildSimpleRoutingRuleRow: erzeugt Simple-Routing ohne Journey', () => {
  const row = buildSimpleRoutingRuleRow({
    topicId: 'blut',
    name: 'Blutabnahme',
    targetLocationId: 'labor',
    terminalInstructionTemplate: 'Bitte warten.',
    allowRedirect: true,
    active: true,
  });

  assert.equal(row.id, 'rule_blut');
  assert.equal(row.initialTargetLocationId, 'labor');
  assert.equal(row.initialQueueId, PF_FLOW_QUEUE_GENERAL);
  assert.equal(row.initialLastKnownLocationId, PF_FLOW_LOC_WAITING);
  assert.equal(row.journeyTemplateId, null);
  assert.equal(row.initialMovementMode, 'call');
});

test('syncCatalogFromOpsSettings in simple mode: alle RoutingRules ohne Journey', () => {
  const settings = sampleOpsSettings();
  assert.equal(isSimpleRoutingMode(settings), true);

  const db = openTestFlowCoreDb();
  syncCatalogFromOpsSettings(db, settings);

  const rules = db
    .prepare(
      'SELECT topic_id AS topicId, journey_template_id AS journeyTemplateId FROM routing_rules',
    )
    .all() as Array<{ topicId: string; journeyTemplateId: string | null }>;
  assert.ok(rules.length > 0);
  assert.ok(rules.every((rule) => rule.journeyTemplateId === null));

  validateCatalogIntegrity(loadCatalog(db));
});

test('syncCatalogFromOpsSettings in simple mode ignores stored topic journeyTemplateId', () => {
  const db = openTestFlowCoreDb();
  syncCatalogFromOpsSettings(db, {
    ...sampleOpsSettings(),
    topics: sampleOpsSettings().topics.map((topic) =>
      topic.topicId === 'blut' ? { ...topic, journeyTemplateId: 'journey_blut' } : topic,
    ),
    journeySettings: {
      templates: [
        {
          id: 'journey_blut',
          name: 'Blut',
          topicId: 'blut',
          active: true,
          steps: [
            {
              id: 'step_blut_0',
              sortOrder: 0,
              targetLocationId: 'labor',
              queueId: PF_FLOW_QUEUE_GENERAL,
              movementMode: 'call',
              publicDisplayMode: 'visible',
              completedWhen: 'arrive',
              instructionText: null,
            },
          ],
        },
      ],
    },
  });

  const blutRule = db
    .prepare(
      'SELECT journey_template_id AS journeyTemplateId FROM routing_rules WHERE topic_id = ?',
    )
    .get('blut') as { journeyTemplateId: string | null } | undefined;
  assert.equal(blutRule?.journeyTemplateId, null);
});

test('syncCatalogFromOpsSettings in complex mode without journeys keeps simple rules', () => {
  const db = openTestFlowCoreDb();
  syncCatalogFromOpsSettings(db, { ...sampleOpsSettings(), routingMode: 'complex' });

  const rules = db
    .prepare('SELECT journey_template_id AS journeyTemplateId FROM routing_rules')
    .all() as Array<{ journeyTemplateId: string | null }>;
  assert.ok(rules.length > 0);
  assert.ok(rules.every((rule) => rule.journeyTemplateId === null));
});

test('syncCatalogFromOpsSettings in complex mode: mixed topics with and without journey', () => {
  const db = openTestFlowCoreDb();
  const settings: OpsSettings = {
    ...sampleOpsSettings(),
    routingMode: 'complex',
    topics: sampleOpsSettings().topics.map((topic) =>
      topic.topicId === 'blut' ? { ...topic, journeyTemplateId: 'journey_blut' } : topic,
    ),
    journeySettings: {
      templates: [
        {
          id: 'journey_blut',
          name: 'Blut → Labor',
          topicId: 'blut',
          active: true,
          steps: [
            {
              id: 'step_blut_0',
              sortOrder: 0,
              targetLocationId: 'labor',
              queueId: PF_FLOW_QUEUE_GENERAL,
              movementMode: 'call',
              publicDisplayMode: 'visible',
              completedWhen: 'arrive',
              instructionText: null,
            },
          ],
        },
      ],
    },
  };
  syncCatalogFromOpsSettings(db, settings);

  const blutRule = db
    .prepare(
      'SELECT journey_template_id AS journeyTemplateId FROM routing_rules WHERE topic_id = ?',
    )
    .get('blut') as { journeyTemplateId: string | null } | undefined;
  assert.equal(blutRule?.journeyTemplateId, 'journey_blut');

  const rezeptRule = db
    .prepare(
      'SELECT journey_template_id AS journeyTemplateId FROM routing_rules WHERE topic_id = ?',
    )
    .get('rezept') as { journeyTemplateId: string | null } | undefined;
  assert.equal(rezeptRule?.journeyTemplateId, null);

  validateCatalogIntegrity(loadCatalog(db));
});

test('complex mixed mode check-in uses journey step 0 for journey topic', () => {
  const db = openTestFlowCoreDb();
  const settings: OpsSettings = {
    ...sampleOpsSettings(),
    routingMode: 'complex',
    topics: sampleOpsSettings().topics.map((topic) =>
      topic.topicId === 'blut' ? { ...topic, journeyTemplateId: 'journey_blut' } : topic,
    ),
    journeySettings: {
      templates: [
        {
          id: 'journey_blut',
          name: 'Blut → Labor',
          topicId: 'blut',
          active: true,
          steps: [
            {
              id: 'step_blut_0',
              sortOrder: 0,
              targetLocationId: 'labor',
              queueId: PF_FLOW_QUEUE_GENERAL,
              movementMode: 'call',
              publicDisplayMode: 'visible',
              completedWhen: 'arrive',
              instructionText: null,
            },
          ],
        },
      ],
    },
  };
  syncCatalogFromOpsSettings(db, settings);

  const runtime = getFlowCoreRuntime(db);
  const visit = runtime.checkIn({
    topicId: 'blut',
    authPath: 'phone_dob',
    surfaceId: PF_FLOW_SURFACE_TERMINAL,
  });
  assert.equal(visit.journeyTemplateId, 'journey_blut');
  assert.equal(visit.journeyStepIndex, 0);
  assert.equal(visit.journeyState, 'active');
  assert.equal(visit.targetLocationId, 'labor');
});

test('syncCatalogFromOpsSettings maps defaultRoomId to routing target location', () => {
  const db = openTestFlowCoreDb();
  const settings = {
    ...sampleOpsSettings(),
    topics: sampleOpsSettings().topics.map((topic) =>
      topic.topicId === 'blut' ? { ...topic, defaultRoomId: 'labor' } : topic,
    ),
  };
  syncCatalogFromOpsSettings(db, settings);

  const rule = db
    .prepare('SELECT initial_target_location_id AS target FROM routing_rules WHERE topic_id = ?')
    .get('blut') as { target: string } | undefined;
  assert.equal(rule?.target, 'labor');
});

test('syncCatalogFromOpsSettings reflects ops_settings topic label on resync', () => {
  const db = openTestFlowCoreDb();
  const settings = sampleOpsSettings();
  syncCatalogFromOpsSettings(db, settings);

  const before = db.prepare('SELECT name FROM topics WHERE id = ?').get('blut') as
    | { name?: string }
    | undefined;
  assert.ok(before?.name);

  syncCatalogFromOpsSettings(db, {
    ...settings,
    topics: settings.topics.map((topic) =>
      topic.topicId === 'blut' ? { ...topic, label: 'Blutabnahme NEU' } : topic,
    ),
  });

  const after = db.prepare('SELECT name FROM topics WHERE id = ?').get('blut') as
    | { name?: string }
    | undefined;
  assert.equal(after?.name, 'Blutabnahme NEU');
  validateCatalogIntegrity(loadCatalog(db));
});
