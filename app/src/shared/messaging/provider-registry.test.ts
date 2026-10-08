import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import { buildMessagingProviderCatalog } from './provider-registry.js';
import { registerOpsMessagingRoutes } from '../../routes/ops/ops-messaging-routes.js';
import type { CoreDatabase } from '../db/database.js';

test('messaging catalog exposes saved form values and key presence without leaking credentials', async () => {
  const catalog = buildMessagingProviderCatalog({
    seven: { enabled: true, credentials: { apiKey: 'secret-sms-key', from: 'Praxis' } },
    seven_whatsapp: {
      enabled: false,
      credentials: {
        from: '491700000000',
        template: 'recall',
        language: 'de',
        extraSecret: 'never-return-this',
      },
    },
  });
  const app = Fastify();
  registerOpsMessagingRoutes(app, { getMessagingProviderCatalog: () => catalog } as CoreDatabase);
  try {
    const response = await app.inject('/api/v1/ops/messaging/providers');
    assert.equal(response.statusCode, 200);
    const providers = response
      .json()
      .channels.flatMap((channel: { providers: unknown[] }) => channel.providers);
    assert.equal(providers[1].hasApiKey, true);
    assert.equal(providers[1].settings.from, 'Praxis');
    assert.equal(providers[2].hasApiKey, true);
    assert.deepEqual(providers[2].settings, {
      from: '491700000000',
      template: 'recall',
      language: 'de',
    });
    assert.equal(response.body.includes('secret-sms-key'), false);
    assert.equal(response.body.includes('never-return-this'), false);
    assert.equal(buildMessagingProviderCatalog({}).channels[0].providers[1].hasApiKey, false);
  } finally {
    await app.close();
  }
});
