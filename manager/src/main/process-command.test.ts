import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { devSetupArguments } from './process-command.js';

test('dev setup uses direct loader and entry arguments without a shell', () => {
  const root = path.resolve('Praxis Müller & Partner $test');
  const args = devSetupArguments(root);
  assert.equal(args[0], '--import');
  assert.equal(fileURLToPath(args[1]!), path.join(root, 'node_modules/tsx/dist/loader.mjs'));
  assert.equal(args[2], path.join(root, 'setup/src/server.ts'));
});
