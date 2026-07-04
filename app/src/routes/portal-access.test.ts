import assert from 'node:assert/strict';
import test from 'node:test';
import { PORTAL_DISABLED_RESPONSE } from './portal-access.js';

test('PORTAL_DISABLED_RESPONSE uses stable API code', () => {
  assert.equal(PORTAL_DISABLED_RESPONSE.code, 'PORTAL_DISABLED');
  assert.match(PORTAL_DISABLED_RESPONSE.message, /Patientenportal/i);
});
