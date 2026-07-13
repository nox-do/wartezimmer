import assert from 'node:assert/strict';
import test from 'node:test';
import { truncateLogTail } from './sandbox-log.js';

test('truncateLogTail shortens long freshclam output', () => {
  const long = 'x'.repeat(600);
  const tail = truncateLogTail(long, 500);
  assert.equal(tail.length, 501);
  assert.match(tail, /^…/);
});
