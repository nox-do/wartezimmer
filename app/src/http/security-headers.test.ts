import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import { registerSecurityHeaders } from './security-headers.js';

test('registerSecurityHeaders adds conservative browser hardening headers', async () => {
  const app = Fastify({ logger: false });
  registerSecurityHeaders(app);
  app.get('/probe', async () => ({ ok: true }));
  await app.ready();

  const response = await app.inject({ method: 'GET', url: '/probe' });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['x-frame-options'], 'SAMEORIGIN');
  assert.equal(response.headers['referrer-policy'], 'same-origin');
  assert.equal(response.headers['permissions-policy'], 'camera=(), microphone=(), geolocation=()');

  await app.close();
});
