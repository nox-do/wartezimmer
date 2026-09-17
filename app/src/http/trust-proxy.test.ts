import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import { resolveAppTrustProxy } from '../app.js';
import { createRateLimiter } from './simple-rate-limit.js';

async function withProxyTrust<T>(enabled: boolean, action: () => Promise<T>): Promise<T> {
  const previous = process.env.TRUST_PROXY_HEADERS;
  process.env.TRUST_PROXY_HEADERS = String(enabled);
  try {
    return await action();
  } finally {
    if (previous === undefined) delete process.env.TRUST_PROXY_HEADERS;
    else process.env.TRUST_PROXY_HEADERS = previous;
  }
}

test('single-hop proxy trust uses Caddy client address and ignores farther spoofed entries', async () => {
  await withProxyTrust(true, async () => {
    const app = Fastify({ trustProxy: resolveAppTrustProxy() });
    app.get('/ip', (request) => ({ ip: request.ip }));
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/ip',
        remoteAddress: '172.20.0.3',
        headers: {
          'x-forwarded-for': '198.51.100.99, 203.0.113.7',
        },
      });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json(), { ip: '203.0.113.7' });
    } finally {
      await app.close();
    }
  });
});

test('single-hop proxy trust keeps separate client rate-limit buckets', async () => {
  await withProxyTrust(true, async () => {
    const app = Fastify({ trustProxy: resolveAppTrustProxy() });
    const allow = createRateLimiter({ maxRequests: 1, windowMs: 60_000 });
    app.get('/limited', (request, reply) => {
      if (!allow(request.ip)) return reply.code(429).send();
      return reply.code(204).send();
    });
    const request = (forwardedFor: string) =>
      app.inject({
        method: 'GET',
        url: '/limited',
        remoteAddress: '172.20.0.3',
        headers: { 'x-forwarded-for': `198.51.100.99, ${forwardedFor}` },
      });
    try {
      assert.equal((await request('203.0.113.7')).statusCode, 204);
      assert.equal((await request('203.0.113.7')).statusCode, 429);
      assert.equal((await request('203.0.113.8')).statusCode, 204);
    } finally {
      await app.close();
    }
  });
});

test('direct mode ignores forwarded client addresses', async () => {
  await withProxyTrust(false, async () => {
    const app = Fastify({ trustProxy: resolveAppTrustProxy() });
    app.get('/ip', (request) => ({ ip: request.ip }));
    try {
      for (const forwardedFor of ['198.51.100.10', '203.0.113.20']) {
        const response = await app.inject({
          method: 'GET',
          url: '/ip',
          remoteAddress: '192.168.1.55',
          headers: { 'x-forwarded-for': forwardedFor },
        });
        assert.deepEqual(response.json(), { ip: '192.168.1.55' });
      }
    } finally {
      await app.close();
    }
  });
});
