import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { managerProfilePath, prepareManagerProfile } from './manager-profile.js';

function fixture(t: { after: (fn: () => void) => void }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-manager-profile-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return {
    profileHome: path.join(root, 'PraxisFlow'),
    installHome: path.join(root, 'PraxisFlow'),
    isPackaged: true,
  };
}

test('fresh install creates only the profile beneath the installation root', (t) => {
  const input = fixture(t);
  const profile = prepareManagerProfile(input);
  assert.equal(profile, path.join(input.profileHome, 'manager'));
  assert.ok(fs.statSync(profile).isDirectory());
});

test('dev profiles stay separate and repeated preparation preserves data', (t) => {
  const input = { ...fixture(t), isPackaged: false, installHome: '/dev/repository' };
  const profile = prepareManagerProfile(input);
  fs.writeFileSync(path.join(profile, 'Preferences'), 'saved preferences');
  assert.equal(prepareManagerProfile(input), profile);
  assert.equal(fs.readFileSync(path.join(profile, 'Preferences'), 'utf8'), 'saved preferences');
  assert.notEqual(profile, managerProfilePath({ ...input, installHome: '/dev/other' }));
  assert.notEqual(profile, managerProfilePath({ ...input, isPackaged: true }));
});
