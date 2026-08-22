import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { collectRegisteredAppRoutes, parseRegisteredRoutes } from './fastify-route-scan.mjs';

test('parseRegisteredRoutes recognizes generics and comments before the path', () => {
  const source = `
    app.get<{ Querystring: { deviceId?: string } }>('/api/v1/queue', handler);
    app.post(/* documented */ '/api/v1/checkins', handler);
  `;
  const routes = parseRegisteredRoutes(source);
  assert.deepEqual([...routes.keys()], ['GET /api/v1/queue', 'POST /api/v1/checkins']);
});

test('parseRegisteredRoutes leaves non-matches uncollected', () => {
  const source = `
    app.get('/probe', handler);
    app.get(\`/api/v1/queue\`, handler);
    app.route({ method: 'GET', url: '/api/v1/queue' });
    const path = '/api/v1/queue';
    app.get(path, handler);
  `;
  assert.equal(parseRegisteredRoutes(source).size, 0);
});

test('collectRegisteredAppRoutes skips nested *.test.ts and *.spec.ts', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-route-scan-'));
  try {
    const nested = path.join(tempRoot, 'nested');
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(
      path.join(tempRoot, 'health-routes.ts'),
      "app.get('/api/v1/ops/health', handler);\n",
    );
    fs.writeFileSync(path.join(nested, 'queue-routes.ts'), "app.get('/api/v1/queue', handler);\n");
    fs.writeFileSync(
      path.join(nested, 'auth-routes.test.ts'),
      "app.get('/api/v1/queue', handler);\n",
    );
    fs.writeFileSync(
      path.join(nested, 'auth-routes.spec.ts'),
      "app.post('/api/v1/checkins', handler);\n",
    );

    const routes = collectRegisteredAppRoutes(tempRoot);
    assert.deepEqual([...routes.keys()].sort(), ['GET /api/v1/ops/health', 'GET /api/v1/queue']);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
