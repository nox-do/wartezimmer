import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dockerInstallLink,
  dockerPrerequisitesHints,
} from './docker-prerequisites-ui.js';

test('dockerInstallLink returns platform-specific docs URL', () => {
  assert.equal(
    dockerInstallLink('darwin').url,
    'https://docs.docker.com/desktop/setup/install/mac-install/',
  );
  assert.equal(
    dockerInstallLink('win32').url,
    'https://docs.docker.com/desktop/setup/install/windows-install/',
  );
  assert.match(dockerInstallLink('linux').url, /engine\/install/);
});

test('dockerPrerequisitesHints suggests install link when docker missing', () => {
  const result = dockerPrerequisitesHints(
    { installed: false, daemonRunning: false, composeAvailable: false },
    'darwin',
  );
  assert.ok(result.installLink);
  assert.match(result.hints.join(' '), /erneut prüfen/);
});

test('dockerPrerequisitesHints omits install link when only daemon is down', () => {
  const result = dockerPrerequisitesHints(
    { installed: true, daemonRunning: false, composeAvailable: true },
    'darwin',
  );
  assert.equal(result.installLink, null);
  assert.match(result.hints[0], /Docker Desktop starten/);
});
