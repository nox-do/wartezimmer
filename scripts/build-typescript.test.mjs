import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

test('TypeScript build removes deleted modules and refuses to clean source paths', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-clean-build-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(directory, 'node_modules'));
  fs.symlinkSync(
    path.dirname(require.resolve('typescript/package.json')),
    path.join(directory, 'node_modules/typescript'),
    'dir',
  );
  fs.writeFileSync(path.join(directory, 'package.json'), '{}');
  fs.mkdirSync(path.join(directory, 'src'));
  fs.writeFileSync(path.join(directory, 'src/current.ts'), 'export const current = 1;');
  const config = {
    compilerOptions: { outDir: 'dist', rootDir: 'src', types: [] },
    include: ['src/**/*.ts'],
  };
  fs.writeFileSync(path.join(directory, 'tsconfig.json'), JSON.stringify(config));
  fs.mkdirSync(path.join(directory, 'dist'));
  fs.writeFileSync(path.join(directory, 'dist/deleted-module.js'), 'obsolete');
  const invoke = () =>
    spawnSync(process.execPath, [new URL('./build-typescript.mjs', import.meta.url).pathname], {
      cwd: directory,
      encoding: 'utf8',
    });
  const result = invoke();
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.deepEqual(fs.readdirSync(path.join(directory, 'dist')), ['current.js']);
  config.compilerOptions.outDir = 'src';
  fs.writeFileSync(path.join(directory, 'tsconfig.json'), JSON.stringify(config));
  const rejected = invoke();
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /workspace-local dist|No inputs were found/);
  assert.equal(
    fs.readFileSync(path.join(directory, 'src/current.ts'), 'utf8'),
    'export const current = 1;',
  );
});
