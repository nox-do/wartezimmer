import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import test from 'node:test';
import { listUntrackedGeneratedFiles, repoRootFromImportMeta } from './openapi-lib.mjs';
import { openApiTypeJobs } from './generate-openapi-types.mjs';

const root = repoRootFromImportMeta(import.meta.url);

test('openapi type table keeps ui and app outputs disjoint and identity app-only', () => {
  const ui = openApiTypeJobs('ui').flatMap((job) => job.outputs);
  const app = openApiTypeJobs('app').flatMap((job) => job.outputs);
  const jobs = openApiTypeJobs('all');
  const all = jobs.flatMap((job) => job.outputs);

  assert.equal(ui.length, 5);
  assert.equal(app.length, 6);
  assert.equal(all.length, 11);
  assert.equal(new Set(all).size, all.length);

  assert.equal(jobs.length, 6);
  assert.equal(new Set(jobs.map((job) => job.spec)).size, 6);
  const identity = jobs.find((job) => job.spec === 'identity.yaml');
  assert.deepEqual(identity.outputs, ['app/src/api/generated/identity-openapi.d.ts']);
  assert.equal(ui.includes('app/src/api/generated/identity-openapi.d.ts'), false);
});

test('untracked UI openapi output fails the tracked-files guard', () => {
  const untracked = listUntrackedGeneratedFiles(
    ['ui/src/lib/ops/generated/__untracked-openapi.d.ts'],
    root,
  );
  assert.deepEqual(untracked, ['ui/src/lib/ops/generated/__untracked-openapi.d.ts']);
});

function createFixture(t) {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-api-check-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  for (const entry of ['scripts', 'openapi', 'prettier.config.cjs']) {
    fs.cpSync(path.join(root, entry), path.join(fixture, entry), { recursive: true });
  }
  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(fixture, 'node_modules'), linkType);
  fs.mkdirSync(path.join(fixture, 'ui'));
  fs.symlinkSync(
    path.join(root, 'ui/node_modules'),
    path.join(fixture, 'ui/node_modules'),
    linkType,
  );
  return fixture;
}

test('generation reports schema warnings and writes the shared types to both workspaces', (t) => {
  const fixture = createFixture(t);
  fs.writeFileSync(path.join(fixture, 'redocly.yaml'), 'rules:\n  operation-summary: warn\n');
  const schema = `openapi: 3.1.0
info: { title: Fixture, version: '1' }
paths:
  /fixture:
    get:
      operationId: reviewFixture
      responses:
        '200': { description: OK }
`;
  for (const { spec } of openApiTypeJobs('all')) {
    fs.writeFileSync(path.join(fixture, 'openapi', spec), schema);
  }
  const result = spawnSync(
    process.execPath,
    ['scripts/generate-openapi-types.mjs', '--group', 'all'],
    {
      cwd: fixture,
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(result.stderr, /summary.*#\/paths\/~1fixture\/get/);
  const appTypes = fs.readFileSync(
    path.join(fixture, 'app/src/api/generated/ops-openapi.d.ts'),
    'utf8',
  );
  const uiTypes = fs.readFileSync(
    path.join(fixture, 'ui/src/lib/ops/generated/ops-openapi.d.ts'),
    'utf8',
  );
  assert.match(appTypes, /reviewFixture/);
  assert.equal(appTypes, uiTypes);
});

for (const [script, args, output] of [
  ['bundle-openapi.mjs', [], 'openapi/bundle.json'],
  ['generate-fastify-schemas.mjs', [], 'app/src/api/generated/common.fastify-schemas.ts'],
  ['generate-openapi-types.mjs', ['--group', 'ui'], 'ui/src/lib/ops/generated/ops-openapi.d.ts'],
  ['generate-openapi-types.mjs', ['--group', 'app'], 'app/src/api/generated/ops-openapi.d.ts'],
]) {
  test(`--check preserves stale files and does not create missing files: ${output}`, (t) => {
    const fixture = createFixture(t);
    const target = path.join(fixture, output);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const sentinel = 'intentionally stale; preserve exactly\r\n';
    fs.writeFileSync(target, sentinel);
    const before = fs.statSync(target).mtimeMs;
    const invoke = () =>
      spawnSync(process.execPath, [path.join(fixture, 'scripts', script), '--check', ...args], {
        cwd: fixture,
        encoding: 'utf8',
      });
    const stale = invoke();
    assert.equal(stale.status, 1, stale.stderr + stale.stdout);
    assert.match(stale.stderr, /Generated file out of date/);
    assert.equal(fs.readFileSync(target, 'utf8'), sentinel);
    assert.equal(fs.statSync(target).mtimeMs, before);
    fs.unlinkSync(target);
    const missing = invoke();
    assert.equal(missing.status, 1, missing.stderr + missing.stdout);
    assert.match(missing.stderr, /Generated file missing/);
    assert.equal(fs.existsSync(target), false);
  });
}
