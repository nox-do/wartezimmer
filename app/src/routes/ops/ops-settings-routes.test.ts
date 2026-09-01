import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import type { CoreDatabase } from '../../shared/db/database.js';
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

test('GET /api/v1/ops/settings/capabilities returns simple routing capabilities', async () => {
  const app = Fastify({ logger: false });
  registerOpsSettingsRoutes(
    app,
    {
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
    } as unknown as CoreDatabase,
  );

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
  registerOpsSettingsRoutes(
    app,
    {
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
    } as unknown as CoreDatabase,
  );

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
