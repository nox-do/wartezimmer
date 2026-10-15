import assert from 'node:assert/strict';
import test from 'node:test';
import { stackStartFailureMessage } from './stack-start-error.js';

test('explains the failed app health dependency without dumping Compose output', () => {
  const message = stackStartFailureMessage(
    new Error(
      'secret=hidden\ndependency failed to start: container wartezimmer-app-1 is unhealthy',
    ),
  );
  assert.match(message, /Die App wurde nicht rechtzeitig betriebsbereit/);
  assert.doesNotMatch(message, /hidden|secret/);
});

test('distinguishes a crash from a health timeout', () => {
  assert.match(
    stackStartFailureMessage(new Error('Compose-Service app läuft nicht (Status: exited).')),
    /App wurde unerwartet beendet/,
  );
  assert.match(
    stackStartFailureMessage(new Error('Health check exceeded timeout (6s)')),
    /Gesundheitsprüfung/,
  );
});
