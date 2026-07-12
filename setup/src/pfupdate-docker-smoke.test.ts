import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const dockerSmokeEnabled = process.env.PFUPDATE_DOCKER_SMOKE === '1';

function dockerAvailable(): boolean {
  const result = spawnSync('docker', ['info'], { encoding: 'utf8' });
  return result.status === 0;
}

test(
  'docker load accepts docker save output used in pfupdate images tar',
  { skip: !dockerSmokeEnabled },
  () => {
    if (!dockerAvailable()) {
      return;
    }

    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfupdate-docker-smoke-'));
    const imagesTar = path.join(workDir, 'images', 'praxis-flow-images.tar');

    try {
      fs.mkdirSync(path.dirname(imagesTar), { recursive: true });
      const saveResult = spawnSync(
        'docker',
        ['save', '-o', imagesTar, 'hello-world:latest'],
        { encoding: 'utf8' },
      );
      assert.equal(saveResult.status, 0, saveResult.stderr || 'docker save hello-world failed');

      const loadResult = spawnSync('docker', ['load', '-i', imagesTar], { encoding: 'utf8' });
      assert.equal(loadResult.status, 0, loadResult.stderr || loadResult.stdout || 'docker load failed');
      assert.match(`${loadResult.stdout}\n${loadResult.stderr}`, /Loaded image|hello-world/i);
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  },
);
