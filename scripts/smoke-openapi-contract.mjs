#!/usr/bin/env node

/**
 * Validates live API JSON responses against openapi/bundle.json schemas.
 * Covers ops, check-in, queue, identity, and sessions (happy paths + selected errors).
 * Requires a running app (staff PIN env vars, AUTH_KEY_CAPTIVE, optional SMOKE_BASE_URL).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDotEnvIfPresent } from './dotenv.mjs';
import {
  captiveBearerAuth,
  ensureCheckinAvailable,
  formatTicketCode,
  pairDeviceForSmoke,
  smokeStaffAuth,
} from './smoke-helpers.mjs';
import { assertResponseSchema, loadOpenApiBundle, requestJson } from './openapi-contract-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  loadDotEnvIfPresent(path.join(root, '.env'));

  const baseUrl = process.env.SMOKE_BASE_URL ?? process.env.APP_BASE_URL ?? 'http://127.0.0.1:8080';
  const opsAuth = await smokeStaffAuth(baseUrl, 'ops');
  const mfaAuth = await smokeStaffAuth(baseUrl, 'mfa');
  const terminalAuth = await pairDeviceForSmoke(
    baseUrl,
    'terminal',
    mfaAuth,
    'smoke-openapi-terminal',
  );
  const captiveAuth = captiveBearerAuth();
  assert(captiveAuth.bearerToken, 'AUTH_KEY_CAPTIVE is required (env or .env)');

  const bundle = loadOpenApiBundle(root);

  console.log('ops) GET /api/v1/ops/settings');
  const settings = await requestJson(baseUrl, '/api/v1/ops/settings', opsAuth);
  assertResponseSchema(bundle, 'GET', '/api/v1/ops/settings', 200, settings, 'ops settings');

  console.log('ops) GET /api/v1/ops/settings/onboarding');
  const onboarding = await requestJson(baseUrl, '/api/v1/ops/settings/onboarding', opsAuth);
  assertResponseSchema(
    bundle,
    'GET',
    '/api/v1/ops/settings/onboarding',
    200,
    onboarding,
    'ops onboarding',
  );

  console.log('ops) POST /api/v1/ops/settings/onboarding/verify');
  const verified = await requestJson(baseUrl, '/api/v1/ops/settings/onboarding/verify', opsAuth, {
    method: 'POST',
  });
  assertResponseSchema(
    bundle,
    'POST',
    '/api/v1/ops/settings/onboarding/verify',
    200,
    verified,
    'ops verify',
  );
  assert(verified.checksVerified === true, 'verify response must set checksVerified=true');

  console.log('checkin) GET /api/v1/checkins/topics');
  const topics = await requestJson(baseUrl, '/api/v1/checkins/topics', terminalAuth);
  assertResponseSchema(bundle, 'GET', '/api/v1/checkins/topics', 200, topics, 'checkin topics');

  await ensureCheckinAvailable(baseUrl, mfaAuth);
  console.log('checkin) POST /api/v1/checkins');
  const created = await requestJson(baseUrl, '/api/v1/checkins', terminalAuth, {
    method: 'POST',
    expectedStatus: 201,
    jsonBody: {
      topicId: 'offen',
      authPath: 'phone_dob',
    },
  });
  assertResponseSchema(bundle, 'POST', '/api/v1/checkins', 201, created, 'checkin create');

  const visitId = created.visitId;
  const ticketCode = formatTicketCode(created.laneCode, created.number);

  console.log('identity) POST /api/v1/identity/phone-dob-lookup');
  const lookup = await requestJson(baseUrl, '/api/v1/identity/phone-dob-lookup', mfaAuth, {
    method: 'POST',
    jsonBody: {
      phoneNumber: '+491701234567',
      birthDate: '1990-01-15',
    },
  });
  assertResponseSchema(
    bundle,
    'POST',
    '/api/v1/identity/phone-dob-lookup',
    200,
    lookup,
    'identity phone-dob lookup',
  );

  console.log(`identity) GET /api/v1/identity/${visitId}`);
  const identity = await requestJson(
    baseUrl,
    `/api/v1/identity/${encodeURIComponent(visitId)}`,
    mfaAuth,
  );
  assertResponseSchema(
    bundle,
    'GET',
    '/api/v1/identity/{visitId}',
    200,
    identity,
    'identity ticket view',
  );

  console.log('sessions) POST /api/v1/portal/sessions/resolve-ticket');
  const resolved = await requestJson(baseUrl, '/api/v1/portal/sessions/resolve-ticket', null, {
    method: 'POST',
    expectedStatus: 201,
    jsonBody: { ticketCode },
  });
  assertResponseSchema(
    bundle,
    'POST',
    '/api/v1/portal/sessions/resolve-ticket',
    201,
    resolved,
    'session resolve',
  );
  const sessionToken = resolved.sessionToken;
  assert(sessionToken, 'resolve-ticket must return sessionToken');

  console.log('sessions) GET /api/v1/portal/sessions/me');
  const sessionMe = await requestJson(baseUrl, '/api/v1/portal/sessions/me', sessionToken);
  assertResponseSchema(bundle, 'GET', '/api/v1/portal/sessions/me', 200, sessionMe, 'session me');

  console.log('sessions) POST /api/v1/portal/sessions/verify-ticket-code');
  const verifiedTicket = await requestJson(
    baseUrl,
    '/api/v1/portal/sessions/verify-ticket-code',
    captiveAuth,
    {
      method: 'POST',
      jsonBody: { ticketCode },
    },
  );
  assertResponseSchema(
    bundle,
    'POST',
    '/api/v1/portal/sessions/verify-ticket-code',
    200,
    verifiedTicket,
    'session verify ticket code',
  );

  console.log('sessions) POST /api/v1/portal/sessions/resolve-ticket (404 invalid code)');
  const resolveMissing = await requestJson(
    baseUrl,
    '/api/v1/portal/sessions/resolve-ticket',
    null,
    {
      method: 'POST',
      expectedStatus: 404,
      jsonBody: { ticketCode: 'ZZ-999' },
    },
  );
  assertResponseSchema(
    bundle,
    'POST',
    '/api/v1/portal/sessions/resolve-ticket',
    404,
    resolveMissing,
    'session resolve not found',
  );

  console.log(`queue) POST /api/v1/queue/${visitId}/transition`);
  const called = await requestJson(
    baseUrl,
    `/api/v1/queue/${encodeURIComponent(visitId)}/transition`,
    mfaAuth,
    {
      method: 'POST',
      jsonBody: { type: 'call' },
    },
  );
  assertResponseSchema(
    bundle,
    'POST',
    '/api/v1/queue/{visitId}/transition',
    200,
    called,
    'queue transition',
  );

  console.log('queue) GET /api/v1/queue/summary');
  const summary = await requestJson(baseUrl, '/api/v1/queue/summary', mfaAuth);
  assertResponseSchema(bundle, 'GET', '/api/v1/queue/summary', 200, summary, 'queue summary');

  console.log('queue) GET /api/v1/queue');
  const queue = await requestJson(baseUrl, '/api/v1/queue', mfaAuth);
  assertResponseSchema(bundle, 'GET', '/api/v1/queue', 200, queue, 'queue list');

  console.log('smoke-openapi-contract: OK');
}

main().catch((error) => {
  console.error('smoke-openapi-contract: FAILED');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
