import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import type { PatientSession } from '../shared/db/db-types.js';
import {
  createRequirePatientSessionPreHandler,
  getPatientSessionToken,
  readBearerToken,
} from './session-auth.js';

const activeSession: PatientSession = {
  sessionId: 'session-1',
  visitId: 'ticket-1',
  expiresAt: '2099-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  status: 'active',
};

const db = {
  getPatientSession(token: string): PatientSession {
    if (token === 'valid-session-token') {
      return activeSession;
    }
    if (token === 'expired-session-token') {
      throw new Error('SESSION_EXPIRED');
    }
    throw new Error('SESSION_UNAUTHORIZED');
  },
};

test('patient session preHandler rejects missing bearer token', async () => {
  const app = Fastify({ logger: false });
  const requirePatientSession = createRequirePatientSessionPreHandler(db);

  app.get('/probe', { preHandler: requirePatientSession }, async (request) => ({
    token: getPatientSessionToken(request),
  }));

  await app.ready();
  const response = await app.inject({ method: 'GET', url: '/probe' });
  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), { code: 'SESSION_UNAUTHORIZED', message: 'Unauthorized.' });
  await app.close();
});

test('patient session preHandler attaches token and session for valid bearer', async () => {
  const app = Fastify({ logger: false });
  const requirePatientSession = createRequirePatientSessionPreHandler(db);

  app.get('/probe', { preHandler: requirePatientSession }, async (request) => ({
    token: getPatientSessionToken(request),
    sessionId: request.patientSession?.sessionId ?? null,
  }));

  await app.ready();
  const response = await app.inject({
    method: 'GET',
    url: '/probe',
    headers: { authorization: 'Bearer valid-session-token' },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { token: 'valid-session-token', sessionId: 'session-1' });
  await app.close();
});

test('readBearerToken parses bearer header', () => {
  assert.equal(readBearerToken('Bearer abc.def'), 'abc.def');
  assert.equal(readBearerToken(undefined), null);
});
