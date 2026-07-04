import assert from 'node:assert/strict';
import test from 'node:test';
import { appDataVolumeName } from './staff-pin-reset.js';

test('appDataVolumeName follows compose project naming', () => {
  assert.equal(appDataVolumeName('praxis-flow'), 'praxis-flow_app_data');
});
