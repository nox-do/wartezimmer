import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import test from 'node:test';
import { listUntrackedGeneratedFiles, repoRootFromImportMeta } from './openapi-lib.mjs';
import { listOpenApiTypeOutputs, OPENAPI_TYPE_SPECS } from './openapi-types-lib.mjs';

const root = repoRootFromImportMeta(import.meta.url);

test('openapi type table keeps ui and app outputs disjoint and identity app-only', () => {
  const ui = listOpenApiTypeOutputs('ui');
  const app = listOpenApiTypeOutputs('app');
  const all = listOpenApiTypeOutputs('all');

  assert.equal(ui.length, 5);
  assert.equal(app.length, 6);
  assert.equal(all.length, 11);
  assert.equal(new Set(all).size, all.length);

  const identity = OPENAPI_TYPE_SPECS.find((entry) => entry.spec === 'identity.yaml');
  assert.ok(identity);
  assert.equal(identity.ui, undefined);
  assert.equal(identity.app, 'app/src/api/generated/identity-openapi.d.ts');
  assert.equal(ui.includes('app/src/api/generated/identity-openapi.d.ts'), false);
});

test('untracked UI openapi output fails the tracked-files guard', () => {
  const untracked = listUntrackedGeneratedFiles(
    ['ui/src/lib/ops/generated/__untracked-openapi.d.ts'],
    root,
  );
  assert.deepEqual(untracked, ['ui/src/lib/ops/generated/__untracked-openapi.d.ts']);
});

// Exercise real CLI entrypoints in a disposable repository copy, never edit tracked outputs.
for (const [script, output] of [
  ['check-bundle-sync.mjs', 'openapi/bundle.json'],
  ['check-fastify-schemas-sync.mjs', 'app/src/api/generated/common.fastify-schemas.ts'],
  ['check-openapi-types-sync.mjs', 'ui/src/lib/ops/generated/ops-openapi.d.ts'],
  ['check-app-openapi-types-sync.mjs', 'app/src/api/generated/ops-openapi.d.ts'],
]) {
  test(`${script} preserves stale files and does not create missing files`, (t) => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-api-check-'));
    t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
    for (const entry of ['scripts', 'openapi', 'prettier.config.cjs']) {
      fs.cpSync(path.join(root, entry), path.join(fixture, entry), { recursive: true });
    }
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(fixture, 'node_modules'), 'dir');
    fs.mkdirSync(path.join(fixture, 'ui'), { recursive: true });
    fs.symlinkSync(
      path.join(root, 'ui/node_modules'),
      path.join(fixture, 'ui/node_modules'),
      'dir',
    );
    const target = path.join(fixture, output);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const sentinel = 'intentionally stale; preserve exactly\r\n';
    fs.writeFileSync(target, sentinel);
    const before = fs.statSync(target).mtimeMs;
    const invoke = () =>
      spawnSync(process.execPath, [path.join(fixture, 'scripts', script)], {
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
