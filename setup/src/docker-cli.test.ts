import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDockerEnv, fallbackDockerCliDirs } from './docker-cli.js';

test('fallbackDockerCliDirs includes Docker.app path only on macOS', () => {
  assert.ok(
    fallbackDockerCliDirs('darwin').includes('/Applications/Docker.app/Contents/Resources/bin'),
  );
  assert.ok(!fallbackDockerCliDirs('linux').includes('/Applications/Docker.app/Contents/Resources/bin'));
  assert.ok(!fallbackDockerCliDirs('win32').includes('/Applications/Docker.app/Contents/Resources/bin'));
});

test('buildDockerEnv prepends fallback docker cli directories to PATH', () => {
  const env = buildDockerEnv({ PATH: '/usr/bin:/bin' });
  assert.match(env.PATH ?? '', /^\/usr\/local\/bin:/);
  assert.match(env.PATH ?? '', /\/usr\/bin:\/bin$/);
});
