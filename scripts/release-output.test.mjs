import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  defaultReleaseVersion,
  publishReleaseArtifacts,
  releaseDirectory,
} from './release-output.mjs';

test('release directory rejects versions that escape or omit the version folder', () => {
  for (const version of ['', '..', '../outside', '1/2', undefined]) {
    assert.throws(() => releaseDirectory(version), /Release-Version/);
  }
});

test('manager artifacts share the stack release folder without replacing stack packages', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'wartezimmer-release-output-'));
  try {
    const releases = path.join(temporary, 'releases');
    const destination = releaseDirectory('6.1.1', releases);
    fs.mkdirSync(destination, { recursive: true });
    const stack = path.join(destination, 'wartezimmer-6.1.1-linux-arm64.pfinstall');
    fs.writeFileSync(stack, 'stack');
    const installer = path.join(temporary, 'WartezimmerManager-6.1.2-arm64.dmg');
    fs.writeFileSync(installer, 'manager');
    assert.equal(publishReleaseArtifacts([installer], '6.1.1', releases), destination);
    assert.equal(fs.readFileSync(stack, 'utf8'), 'stack');
    assert.equal(
      fs.readFileSync(path.join(destination, path.basename(installer)), 'utf8'),
      'manager',
    );
    assert.equal(fs.readdirSync(destination).length, 2);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('common release version can be selected independently of the manager version', (t) => {
  const previous = process.env.WARTEZIMMER_RELEASE_VERSION;
  t.after(() => {
    if (previous === undefined) delete process.env.WARTEZIMMER_RELEASE_VERSION;
    else process.env.WARTEZIMMER_RELEASE_VERSION = previous;
  });
  process.env.WARTEZIMMER_RELEASE_VERSION = '6.2.0';
  assert.equal(defaultReleaseVersion(), '6.2.0');
});
