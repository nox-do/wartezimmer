import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFreshclamAttemptMessage } from './freshclam-state.js';

test('buildFreshclamAttemptMessage prefers combined output', () => {
  const message = buildFreshclamAttemptMessage('', 'WARNING: rate limited', 1);
  assert.match(message ?? '', /rate limited/);
});

test('buildFreshclamAttemptMessage reports success without output', () => {
  assert.equal(buildFreshclamAttemptMessage('', '', 0), 'Update erfolgreich');
});
