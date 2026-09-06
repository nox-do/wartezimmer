import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPatchOpsSettingsAllowedForRole } from './ops-settings-patch-by-role.js';

test('ops may patch routingMode', () => {
  assert.deepEqual(
    assertPatchOpsSettingsAllowedForRole('ops', { routingMode: 'complex' }),
    { ok: true },
  );
});

test('mfa may not patch routingMode', () => {
  assert.deepEqual(
    assertPatchOpsSettingsAllowedForRole('mfa', { routingMode: 'complex' }),
    { ok: false, forbiddenKeys: ['routingMode'] },
  );
});

test('unknown roles may not patch routingMode', () => {
  assert.deepEqual(
    assertPatchOpsSettingsAllowedForRole(undefined, { routingMode: 'complex' }),
    { ok: false, forbiddenKeys: ['routingMode'] },
  );
});
