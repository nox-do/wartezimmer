import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import type { CoreDatabase } from '../../shared/db/database.js';
import { DEFAULT_ROOM_PANELS_SETTINGS } from '@praxis-flow/domain';
import { createSerializedExecutor, registerOpsSettingsRoutes } from './ops-settings-routes.js';

test('settings updates execute sequentially even while an earlier update awaits', async () => {
  const serialize = createSerializedExecutor();
  const order: string[] = [];
  let releaseFirst: () => void = () => undefined;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  const first = serialize(async () => {
    order.push('first:start');
    await firstGate;
    order.push('first:end');
  });
  const second = serialize(async () => {
    order.push('second:start');
  });

  await Promise.resolve();
  assert.deepEqual(order, ['first:start']);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(order, ['first:start', 'first:end', 'second:start']);
});

test('a failed settings update does not block the next update', async () => {
  const serialize = createSerializedExecutor();
  const failed = serialize(async () => {
    throw new Error('expected');
  });
  const next = serialize(async () => 'completed');

  await assert.rejects(failed, /expected/);
  assert.equal(await next, 'completed');
});

test('PATCH /api/v1/ops/settings rejects a stale settings revision', async () => {
  const app = Fastify({ logger: false });
  app.addHook('preHandler', async (request) => {
    request.clientRole = 'mfa';
  });
  let updateCalled = false;
  registerOpsSettingsRoutes(app, {
    getOpsSettings: () => ({ updatedAt: '2026-09-22T12:00:00.000Z' }),
    updateOpsSettings: () => {
      updateCalled = true;
      throw new Error('must not update');
    },
  } as unknown as CoreDatabase);

  await app.ready();
  const response = await app.inject({
    method: 'PATCH',
    url: '/api/v1/ops/settings',
    payload: {
      expectedUpdatedAt: '2026-09-22T11:59:00.000Z',
      topics: [],
    },
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().code, 'OPS_SETTINGS_STALE');
  assert.equal(updateCalled, false);
  await app.close();
});

test('GET /api/v1/ops/settings/capabilities returns simple routing capabilities', async () => {
  const app = Fastify({ logger: false });
  registerOpsSettingsRoutes(app, {
    getRoutingCapabilities: () => ({
      routingMode: 'simple',
      openVisitCount: 0,
      features: {
        complexRouting: false,
        journeyDesigner: false,
        routingSimulator: true,
        complexRoutingLicensed: true,
      },
    }),
  } as unknown as CoreDatabase);

  await app.ready();
  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/ops/settings/capabilities',
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    routingMode: 'simple',
    openVisitCount: 0,
    features: {
      complexRouting: false,
      journeyDesigner: false,
      routingSimulator: true,
      complexRoutingLicensed: true,
    },
  });
  await app.close();
});

test('GET /api/v1/ops/settings/capabilities returns complex routing capabilities', async () => {
  const app = Fastify({ logger: false });
  registerOpsSettingsRoutes(app, {
    getRoutingCapabilities: () => ({
      routingMode: 'complex',
      openVisitCount: 2,
      features: {
        complexRouting: true,
        journeyDesigner: true,
        routingSimulator: true,
        complexRoutingLicensed: true,
      },
    }),
  } as unknown as CoreDatabase);

  await app.ready();
  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/ops/settings/capabilities',
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    routingMode: 'complex',
    openVisitCount: 2,
    features: {
      complexRouting: true,
      journeyDesigner: true,
      routingSimulator: true,
      complexRoutingLicensed: true,
    },
  });
  await app.close();
});

test('PATCH /api/v1/ops/settings returns 400 for a normal room named Wartezimmer', async () => {
  const app = Fastify({ logger: false });
  app.addHook('preHandler', async (request) => {
    request.clientRole = 'mfa';
  });
  let updateCalled = false;
  registerOpsSettingsRoutes(app, {
    getOpsSettings: () => ({
      routingMode: 'simple',
      returnWindowMinutes: 15,
      practiceOpenFrom: '08:00',
      practiceOpenTo: '18:00',
      practiceProfileJson: '{}',
      topics: [
        {
          topicId: 'offen',
          label: 'Offen',
          laneCode: 'O',
          defaultRoomId: 'empfang',
          iconId: null,
          accentColor: '#000000',
          enabled: true,
          availableFrom: null,
          availableTo: null,
          sortOrder: 1,
        },
      ],
      journeySettings: { templates: [] },
      rooms: [
        {
          roomId: 'empfang',
          roomLabel: 'Empfang',
          enabled: true,
          defaultCallTarget: true,
          maxOccupancy: null,
          panels: DEFAULT_ROOM_PANELS_SETTINGS,
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
      smsProvider: 'mock',
      exportBasePath: '/tmp',
      updatedAt: '2026-09-07T10:00:00.000Z',
    }),
    updateOpsSettings: () => {
      updateCalled = true;
      throw new Error('must not update');
    },
  } as unknown as CoreDatabase);

  await app.ready();
  const response = await app.inject({
    method: 'PATCH',
    url: '/api/v1/ops/settings',
    payload: {
      rooms: [
        { roomId: 'empfang', roomLabel: 'Empfang', enabled: true, defaultCallTarget: true },
        { roomId: 'raum-2', roomLabel: 'Wartezimmer', enabled: true },
      ],
    },
  });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().code, 'INVALID_ARGUMENT');
  assert.equal(updateCalled, false);
  await app.close();
});
