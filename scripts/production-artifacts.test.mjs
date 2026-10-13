import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { assertProductionTree } from './production-artifacts.mjs';

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-payload-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('rejects debug maps, media, local secrets and test helpers without printing content', (t) => {
  const directory = fixture(t);
  for (const name of [
    'main.mjs.map',
    'settings.env.map',
    'demo.mp4',
    '.env',
    'private.pem',
    'device.test.cjs',
  ]) {
    fs.writeFileSync(path.join(directory, name), 'private-fixture-content');
    assert.throws(
      () => assertProductionTree(directory),
      (error) => error.message.includes(name) && !error.message.includes('private-fixture-content'),
    );
    fs.unlinkSync(path.join(directory, name));
  }
  fs.mkdirSync(path.join(directory, 'test-helpers'));
  assert.throws(() => assertProductionTree(directory), /test-helpers/);
});

test('keeps runtime assets, migrations, public env example and actually used hooks', (t) => {
  const directory = fixture(t);
  for (const name of [
    'main.js',
    'migration.sql',
    'font.woff2',
    'pet.xml',
    '.env.example',
    'test-hooks.js',
  ])
    fs.writeFileSync(path.join(directory, name), 'fixture');
  assertProductionTree(directory);
});

test('production stripping removes nested test-only trees and every source-map type', (t) => {
  const directory = fixture(t);
  fs.mkdirSync(path.join(directory, 'test-helpers'));
  fs.writeFileSync(path.join(directory, 'test-helpers/context.js'), 'fixture');
  fs.writeFileSync(path.join(directory, 'main.mjs.map'), '{}');
  fs.writeFileSync(path.join(directory, 'main.js'), 'export {};');
  const result = spawnSync(
    process.execPath,
    [new URL('./strip-production-artifacts.mjs', import.meta.url).pathname, `dist:${directory}`],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(fs.readdirSync(directory), ['main.js']);
});
