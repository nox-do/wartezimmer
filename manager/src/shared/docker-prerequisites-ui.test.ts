import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dockerInstallLink,
  dockerPrerequisitesHints,
  dockerPrerequisiteChecks,
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

test('unreachable daemon is explicitly blocking while CLI and Compose remain successful', () => {
  const checks = dockerPrerequisiteChecks({
    installed: true,
    daemonRunning: false,
    composeAvailable: true,
  });
  assert.deepEqual(
    checks.map((check) => check.state),
    ['is-done', 'is-bad', 'is-done'],
  );
  assert.equal(checks[1]?.mark, '✗');
  assert.match(checks[1]?.label ?? '', /nicht erreichbar.*blockiert/);
});

test('missing CLI leaves dependent checks unassessed; recovery clears daemon failure', () => {
  assert.deepEqual(
    dockerPrerequisiteChecks({
      installed: false,
      daemonRunning: false,
      composeAvailable: false,
    }).map((check) => check.state),
    ['is-bad', 'is-muted', 'is-muted'],
  );
  assert.ok(
    dockerPrerequisiteChecks({
      installed: true,
      daemonRunning: true,
      composeAvailable: true,
    }).every((check) => check.state === 'is-done'),
  );
  assert.equal(
    dockerPrerequisiteChecks({ installed: true, daemonRunning: true, composeAvailable: false })[2]
      ?.state,
    'is-bad',
  );
});
