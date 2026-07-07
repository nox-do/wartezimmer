import assert from 'node:assert/strict';
import test from 'node:test';
import { MANAGER_LOCAL_HEADER } from './routing-mode.js';

test('manager local header constant matches app auth', () => {
  assert.equal(MANAGER_LOCAL_HEADER, 'x-praxis-manager-local');
});
