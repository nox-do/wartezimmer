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
