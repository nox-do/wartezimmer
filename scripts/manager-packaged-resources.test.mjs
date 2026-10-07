import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('packaged manager resources contain an importable setup server', () => {
  const result = spawnSync('npm', ['run', '-w', '@wartezimmer/manager', 'prepare:packaged'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout || 'prepare:packaged failed');
  assert.match(result.stdout, /packaged setup import ok/);
});
