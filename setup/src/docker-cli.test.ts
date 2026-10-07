import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildDockerEnv, fallbackDockerCliDirs, runDockerCommand } from './docker-cli.js';

test('fallbackDockerCliDirs includes Docker.app path only on macOS', () => {
  assert.ok(
    fallbackDockerCliDirs('darwin').includes('/Applications/Docker.app/Contents/Resources/bin'),
  );
  assert.ok(
    !fallbackDockerCliDirs('linux').includes('/Applications/Docker.app/Contents/Resources/bin'),
  );
  assert.ok(
    !fallbackDockerCliDirs('win32').includes('/Applications/Docker.app/Contents/Resources/bin'),
  );
});

test('buildDockerEnv prepends fallback docker cli directories to PATH', () => {
  const env = buildDockerEnv({ PATH: '/usr/bin:/bin' });
  assert.match(env.PATH ?? '', /^\/usr\/local\/bin:/);
  assert.match(env.PATH ?? '', /\/usr\/bin:\/bin$/);
});

test('runDockerCommand does not restore variables omitted from an explicit environment', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wartezimmer-docker-env-'));
  const fakeDocker = path.join(root, 'docker');
  fs.writeFileSync(
    fakeDocker,
    '#!/bin/sh\nprintf "%s|%s" "${APP_BIND_ADDRESS-unset}" "${SETUP_LAN_APP_IP-unset}"\n',
    { mode: 0o755 },
  );
  const previousCli = process.env.WARTEZIMMER_DOCKER_CLI;
  const previousAppBind = process.env.APP_BIND_ADDRESS;
  const previousStaffIp = process.env.SETUP_LAN_APP_IP;
  process.env.WARTEZIMMER_DOCKER_CLI = fakeDocker;
  process.env.APP_BIND_ADDRESS = '0.0.0.0';
  process.env.SETUP_LAN_APP_IP = '0.0.0.0';
  try {
    const result = await runDockerCommand([], { env: { PATH: process.env.PATH } });
    assert.equal(result.code, 0);
    assert.equal(result.stdout, 'unset|unset');
  } finally {
    if (previousCli === undefined) delete process.env.WARTEZIMMER_DOCKER_CLI;
    else process.env.WARTEZIMMER_DOCKER_CLI = previousCli;
    if (previousAppBind === undefined) delete process.env.APP_BIND_ADDRESS;
    else process.env.APP_BIND_ADDRESS = previousAppBind;
    if (previousStaffIp === undefined) delete process.env.SETUP_LAN_APP_IP;
    else process.env.SETUP_LAN_APP_IP = previousStaffIp;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
