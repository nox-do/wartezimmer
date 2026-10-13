import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { stripDependencyArtifacts } from './strip-dependency-artifacts.mjs';

test('dependency stripping preserves runtime data and licenses and never follows symlinks', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-dependency-strip-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dependency = path.join(root, 'node_modules/lib');
  fs.mkdirSync(path.join(dependency, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(dependency, 'tests/helper.js'), 'test');
  fs.mkdirSync(path.join(dependency, 'spec'), { recursive: true });
  fs.writeFileSync(path.join(dependency, 'spec/index.spec.js'), 'test');
  fs.mkdirSync(path.join(dependency, 'specs'), { recursive: true });
  fs.writeFileSync(path.join(dependency, 'specs/helper.js'), 'test');
  for (const name of [
    'index.js',
    'index.js.map',
    'index.d.ts',
    'source.ts',
    'index.test-d.ts',
    'LICENSE',
    'schema.json',
    'runtime.wasm',
  ])
    fs.writeFileSync(path.join(dependency, name), 'fixture');
  const outside = path.join(root, 'workspace');
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'index.d.ts'), 'preserve');
  fs.symlinkSync(
    outside,
    path.join(root, 'node_modules/workspace'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  stripDependencyArtifacts(path.join(root, 'node_modules'));
  assert.deepEqual(fs.readdirSync(dependency).sort(), [
    'LICENSE',
    'index.js',
    'runtime.wasm',
    'schema.json',
  ]);
  assert.equal(fs.readFileSync(path.join(outside, 'index.d.ts'), 'utf8'), 'preserve');
});
