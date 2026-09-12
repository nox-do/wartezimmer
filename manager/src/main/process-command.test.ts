import assert from 'node:assert/strict';
import test from 'node:test';
import { npmExecutable } from './process-command.js';

test('npmExecutable uses the Windows command shim only on Windows', () => {
  assert.equal(npmExecutable('win32'), 'npm.cmd');
  assert.equal(npmExecutable('darwin'), 'npm');
  assert.equal(npmExecutable('linux'), 'npm');
});
