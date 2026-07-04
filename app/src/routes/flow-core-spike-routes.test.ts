import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import { registerFlowCoreSpikeRoutes } from './flow-core-spike-routes.js';
import type { CoreDatabase } from '../shared/db/database.js';
import { DEFAULT_TERMINAL_TOPIC_DEFINITIONS } from '../shared/checkin-topic-settings.js';
import {
  resetFlowCoreSpikeRuntimeForTests,
} from '../shared/flow-core/flow-core-spike-runtime.js';

const originalNodeEnv = process.env.NODE_ENV;
const originalSpikeFlag = process.env.FLOW_CORE_SPIKE_ENABLED;
const originalSpikeDbPath = process.env.FLOW_CORE_SPIKE_DB_PATH;

function buildDb(): CoreDatabase {
  return {
    getOpsSettings: () => ({
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
    }),
  } as CoreDatabase;
}

test('flow-core spike routes expose health and catalog after sync', async () => {
  process.env.NODE_ENV = 'test';
  process.env.FLOW_CORE_SPIKE_ENABLED = '1';
  process.env.FLOW_CORE_SPIKE_DB_PATH = ':memory:';
  resetFlowCoreSpikeRuntimeForTests();

  const app = Fastify();
  registerFlowCoreSpikeRoutes(app, buildDb());
  await app.ready();

  const health = await app.inject({ method: 'GET', url: '/api/v1/dev/flow-core/health' });
  assert.equal(health.statusCode, 200);
  const healthBody = health.json() as { enabled: boolean; catalogLoaded: boolean };
  assert.equal(healthBody.enabled, true);
  assert.equal(healthBody.catalogLoaded, false);

  const sync = await app.inject({ method: 'POST', url: '/api/v1/dev/flow-core/sync-catalog' });
  assert.equal(sync.statusCode, 200);
  const syncBody = sync.json() as { synced: boolean; summary: { topics: number } };
  assert.equal(syncBody.synced, true);
  assert.ok(syncBody.summary.topics >= 1);

  const catalog = await app.inject({ method: 'GET', url: '/api/v1/dev/flow-core/catalog' });
  assert.equal(catalog.statusCode, 200);
  const catalogBody = catalog.json() as { topicCount: number; routingRuleCount: number };
  assert.ok(catalogBody.topicCount >= 1);
  assert.ok(catalogBody.routingRuleCount >= 1);

  await app.close();
  process.env.NODE_ENV = originalNodeEnv;
  process.env.FLOW_CORE_SPIKE_ENABLED = originalSpikeFlag;
  process.env.FLOW_CORE_SPIKE_DB_PATH = originalSpikeDbPath;
  resetFlowCoreSpikeRuntimeForTests();
});

test('flow-core spike check-in creates visit and tv-snapshot uses explainVisibility', async () => {
  process.env.NODE_ENV = 'test';
  process.env.FLOW_CORE_SPIKE_ENABLED = '1';
  process.env.FLOW_CORE_SPIKE_DB_PATH = ':memory:';
  resetFlowCoreSpikeRuntimeForTests();

  const app = Fastify();
  registerFlowCoreSpikeRoutes(app, buildDb());
  await app.ready();

  const sync = await app.inject({ method: 'POST', url: '/api/v1/dev/flow-core/sync-catalog' });
  assert.equal(sync.statusCode, 200);

  const checkIn = await app.inject({
    method: 'POST',
    url: '/api/v1/dev/flow-core/check-in',
    payload: {
      topicId: 'blut',
      displayName: 'Spike Test',
      authPath: 'phone_dob',
    },
  });
  assert.equal(checkIn.statusCode, 200);
  const checkInBody = checkIn.json() as {
    visitId: string;
    queueNumber: string;
    terminalInstruction: string;
    status: string;
    primaryTopicId: string;
  };
  assert.match(checkInBody.visitId, /^\d{8}-L-\d{3}$/);
  assert.match(checkInBody.queueNumber, /^L-\d{3}$/);
  assert.ok(checkInBody.terminalInstruction.includes('Blutabnahme'));
  assert.equal(checkInBody.status, 'waiting');
  assert.equal(checkInBody.primaryTopicId, 'blut');

  const tv = await app.inject({ method: 'GET', url: '/api/v1/dev/flow-core/tv-snapshot' });
  assert.equal(tv.statusCode, 200);
  const tvBody = tv.json() as {
    visibleCount: number;
    totalVisitCount: number;
    visits: Array<{
      visitId: string;
      visible: boolean;
      visibilityReason: string;
      matchingRuleIds: string[];
    }>;
  };
  assert.equal(tvBody.totalVisitCount, 1);
  assert.equal(tvBody.visibleCount, 1);
  const row = tvBody.visits.find((entry) => entry.visitId === checkInBody.visitId);
  assert.ok(row);
  assert.equal(row.visible, true);
  assert.match(row.visibilityReason, /Sichtbar wegen Regel/);
  assert.ok(row.matchingRuleIds.includes('tv_general_visible'));

  const call = await app.inject({
    method: 'POST',
    url: `/api/v1/dev/flow-core/visits/${checkInBody.visitId}/call`,
    payload: {},
  });
  assert.equal(call.statusCode, 200);
  const callBody = call.json() as { visitId: string; status: string };
  assert.equal(callBody.visitId, checkInBody.visitId);
  assert.equal(callBody.status, 'called');

  await app.close();
  process.env.NODE_ENV = originalNodeEnv;
  process.env.FLOW_CORE_SPIKE_ENABLED = originalSpikeFlag;
  process.env.FLOW_CORE_SPIKE_DB_PATH = originalSpikeDbPath;
  resetFlowCoreSpikeRuntimeForTests();
});
