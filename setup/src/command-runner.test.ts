import assert from 'node:assert/strict';
import test from 'node:test';
import { runProcessCommand } from './command-runner.js';

test('runProcessCommand timeoutMs kills hung process', async () => {
  const started = Date.now();
  const result = await runProcessCommand(process.execPath, ['-e', 'setTimeout(() => {}, 30_000)'], {
    timeoutMs: 200,
  });
  const elapsed = Date.now() - started;

  assert.equal(result.code, 124);
  assert.match(result.stderr, /timeout after 200ms/);
  assert.ok(elapsed < 5_000, `expected quick timeout, took ${elapsed}ms`);
});
