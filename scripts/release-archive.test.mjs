import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { packReleaseArchive } from './release-archive.mjs';

test('release archives preserve payload and omit macOS AppleDouble metadata', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-archive-'));
  try {
    const source = path.join(root, 'Quelle mit Umlaut ä');
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'manifest.json'), '{"test":true}');
    if (process.platform === 'darwin') {
      for (const target of [source, path.join(source, 'manifest.json')]) {
        const xattr = spawnSync(
          '/usr/bin/xattr',
          ['-w', 'com.wartezimmer.test', 'metadata', target],
          { encoding: 'utf8' },
        );
        assert.equal(xattr.status, 0, xattr.stderr);
      }
    }
    for (const extension of ['pfinstall', 'pfupdate']) {
      const archive = path.join(root, `Paket mit Umlaut ä.${extension}`);
      packReleaseArchive(archive, source);
      const listed = spawnSync('tar', ['-tzf', archive], {
        encoding: 'utf8',
        env: { ...process.env, COPYFILE_DISABLE: '1' },
      });
      assert.equal(listed.status, 0, listed.stderr);
      assert.deepEqual(listed.stdout.trim().split(/\r?\n/).sort(), ['./', './manifest.json']);
      const extracted = spawnSync('tar', ['-xOf', archive, './manifest.json'], {
        encoding: 'utf8',
      });
      assert.equal(extracted.status, 0, extracted.stderr);
      assert.equal(extracted.stdout, '{"test":true}');
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
