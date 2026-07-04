import assert from 'node:assert/strict';
import test from 'node:test';
import { runProcessCommand } from './command-runner.js';

test('runProcessCommand captures stdout from node', async () => {
  const result = await runProcessCommand(process.execPath, ['-e', 'console.log("ok")']);
  assert.equal(result.code, 0);
  assert.equal(result.stdout, 'ok');
});
