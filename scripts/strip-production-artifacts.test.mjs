import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stripScript = path.join(repoRoot, 'scripts', 'strip-production-artifacts.mjs');

test('strip-production-artifacts removes sources and type maps from package trees', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-strip-'));
  const packageDir = path.join(tempRoot, 'sample');
  const distDir = path.join(packageDir, 'dist');
  const srcDir = path.join(packageDir, 'src');

  fs.mkdirSync(distDir, { recursive: true });
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, 'package.json'), '{}');
  fs.writeFileSync(path.join(packageDir, 'tsconfig.json'), '{}');
  fs.writeFileSync(path.join(srcDir, 'secret.ts'), 'export const secret = 1;');
  fs.writeFileSync(path.join(distDir, 'index.js'), 'export {};');
  fs.writeFileSync(path.join(distDir, 'index.d.ts'), 'export {};');
  fs.writeFileSync(path.join(distDir, 'index.d.ts.map'), '{}');
  fs.writeFileSync(path.join(distDir, 'index.js.map'), '{}');
  fs.writeFileSync(path.join(distDir, 'styles.css.map'), '{}');
  fs.writeFileSync(path.join(distDir, 'widget.test.js'), 'export {};');

  const result = spawnSync(process.execPath, [stripScript, packageDir], {
    cwd: tempRoot,
    stdio: 'pipe',
  });
  assert.equal(result.status, 0, result.stderr?.toString() || result.stdout?.toString());

  assert.equal(fs.existsSync(path.join(srcDir, 'secret.ts')), false);
  assert.equal(fs.existsSync(path.join(packageDir, 'tsconfig.json')), false);
  assert.equal(fs.existsSync(path.join(distDir, 'index.js')), true);
  assert.equal(fs.existsSync(path.join(distDir, 'index.d.ts')), false);
  assert.equal(fs.existsSync(path.join(distDir, 'index.d.ts.map')), false);
  assert.equal(fs.existsSync(path.join(distDir, 'index.js.map')), false);
  assert.equal(fs.existsSync(path.join(distDir, 'styles.css.map')), false);
  assert.equal(fs.existsSync(path.join(distDir, 'widget.test.js')), false);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});
