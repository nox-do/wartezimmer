import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Fastify from 'fastify';
import { registerUiStaticRoutes } from './ui-static-routes.js';

test('static misses return 404 while existing assets and SPA navigation remain available', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'portal-static-'));
  const previousRoot = process.env.UI_STATIC_ROOT;
  const app = Fastify();
  const shell = '<!doctype html><title>SPA bootstrap</title>';
  const script = 'console.log("portal");';
  try {
    mkdirSync(path.join(root, '_app/immutable'), { recursive: true });
    writeFileSync(path.join(root, 'index.html'), shell);
    writeFileSync(path.join(root, '_app/immutable/existing.js'), script);
    writeFileSync(path.join(root, '_app/version.json'), '{"version":"test"}');
    process.env.UI_STATIC_ROOT = root;
    await registerUiStaticRoutes(app);

    for (const method of ['GET', 'HEAD'] as const) {
      for (const url of [
        '/_app/immutable/not-a-real-asset.js',
        '/_app/immutable/not-a-real-asset.js?cache=1',
        '/_app/immutable/missing.css',
        '/_app/immutable/missing',
        '/_app/missing.json',
        '/_app',
        '/%5Fapp/immutable/missing.js',
        '/_app%2Fimmutable%2Fmissing.js',
        '/favicon.ico',
        '/favicon.svg',
        '/api/missing',
        '/internal/missing',
      ]) {
        const response = await app.inject({ method, url });
        assert.equal(response.statusCode, 404, `${method} ${url}`);
        assert.doesNotMatch(response.headers['content-type'] ?? '', /text\/html/);
        assert.equal(response.body.includes('SPA bootstrap'), false);
      }

      const asset = await app.inject({ method, url: '/_app/immutable/existing.js' });
      assert.equal(asset.statusCode, 200);
      assert.match(asset.headers['content-type'] ?? '', /javascript/);
      assert.equal(asset.body, method === 'GET' ? script : '');

      for (const url of [
        '/portal',
        '/portal/',
        '/portal/menu',
        '/portal/upload',
        '/portal/anamnese',
        '/mfa/login',
      ]) {
        const response = await app.inject({ method, url });
        assert.equal(response.statusCode, 200, `${method} ${url}`);
        assert.match(response.headers['content-type'] ?? '', /text\/html/);
        assert.equal(response.body, method === 'GET' ? shell : '');
      }
    }

    assert.equal((await app.inject('/_app/version.json')).statusCode, 200);
    rmSync(path.join(root, '_app/version.json'));
    assert.equal((await app.inject('/_app/version.json')).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: '/portal' })).statusCode, 404);
  } finally {
    await app.close();
    if (previousRoot === undefined) delete process.env.UI_STATIC_ROOT;
    else process.env.UI_STATIC_ROOT = previousRoot;
    rmSync(root, { recursive: true, force: true });
  }
});
