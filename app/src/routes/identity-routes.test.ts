import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import type { CoreDatabase } from '../shared/db/database.js';
import { registerIdentityRoutes } from './identity-routes.js';

function fakeIdentityDb(): CoreDatabase {
  return {
    getOpsSettings: () => ({
      contactLookupFolderPath: null,
      contactLookupDelimiterMode: 'auto' as const,
      contactLookupHasHeader: true,
      contactLookupMappingJson: '{"mobile":"mobil"}',
    }),
  } as unknown as CoreDatabase;
}

test('POST /api/v1/identity/mfa-lookup rejects birthDate-only requests', async () => {
  const app = Fastify({ logger: false });
  registerIdentityRoutes(app, fakeIdentityDb());

  await app.ready();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/identity/mfa-lookup',
    payload: {
      birthDate: '01.01.1980',
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().code, 'INVALID_ARGUMENT');
  await app.close();
});

test('POST /api/v1/identity/mfa-lookup rejects requests without name or phone', async () => {
  const app = Fastify({ logger: false });
  registerIdentityRoutes(app, fakeIdentityDb());

  await app.ready();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/identity/mfa-lookup',
    payload: {},
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().code, 'INVALID_ARGUMENT');
  await app.close();
});

test('POST /api/v1/identity/mfa-lookup returns empty candidates when lookup is disabled', async () => {
  const app = Fastify({ logger: false });
  registerIdentityRoutes(app, fakeIdentityDb());

  await app.ready();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/identity/mfa-lookup',
    payload: {
      name: 'must',
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { candidates: [] });
  await app.close();
});

test('POST /api/v1/identity/mfa-lookup rejects too-short name search', async () => {
  const app = Fastify({ logger: false });
  registerIdentityRoutes(app, fakeIdentityDb());

  await app.ready();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/identity/mfa-lookup',
    payload: {
      name: 'ab',
    },
  });

  assert.equal(response.statusCode, 400);
  await app.close();
});

test('POST /api/v1/identity/mfa-lookup is rate-limited', async () => {
  const app = Fastify({ logger: false });
  registerIdentityRoutes(app, fakeIdentityDb());

  await app.ready();
  let rateLimited = false;
  for (let attempt = 0; attempt < 70; attempt += 1) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/identity/mfa-lookup',
      payload: { name: 'must' },
    });
    if (response.statusCode === 429) {
      rateLimited = true;
      assert.equal(response.json().code, 'RATE_LIMITED');
      break;
    }
  }

  assert.equal(rateLimited, true);
  await app.close();
});

test('POST /api/v1/identity/mfa-lookup rejects too-short phone fragments', async () => {
  const app = Fastify({ logger: false });
  registerIdentityRoutes(app, fakeIdentityDb());

  await app.ready();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/identity/mfa-lookup',
    payload: {
      phoneNumber: '01',
    },
  });

  assert.equal(response.statusCode, 400);
  await app.close();
});
