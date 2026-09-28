import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, utimes, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { cleanSignatureUpdateResidue } from './signature-cache.js';

test('cleans only expired updater directories, preserving signatures, recent work and symlinks', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'signature-cache-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, 'clamav-abcdef.tmp'));
  await mkdir(path.join(dir, 'clamav-123456'));
  await mkdir(path.join(dir, 'keep'));
  await writeFile(path.join(dir, 'daily.cvd'), 'signature data');
  await symlink(path.join(dir, 'keep'), path.join(dir, 'clamav-999999'));
  const expired = new Date(Date.now() - 25 * 3_600_000);
  await utimes(path.join(dir, 'clamav-abcdef.tmp'), expired, expired);
  await utimes(path.join(dir, 'daily.cvd'), expired, expired);
  assert.equal(await cleanSignatureUpdateResidue(dir), 1);
  assert.deepEqual((await readdir(dir)).sort(), [
    'clamav-123456',
    'clamav-999999',
    'daily.cvd',
    'keep',
  ]);
});
