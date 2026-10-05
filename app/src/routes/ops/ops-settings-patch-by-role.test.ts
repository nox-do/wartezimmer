import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPatchOpsSettingsAllowedForRole } from './ops-settings-patch-by-role.js';

test('ops may patch routingMode', () => {
  assert.deepEqual(assertPatchOpsSettingsAllowedForRole('ops', { routingMode: 'complex' }), {
    ok: true,
  });
});

test('settings revision token is allowed for both staff roles', () => {
  const body = { expectedUpdatedAt: '2026-09-22T12:00:00.000Z' };
  assert.deepEqual(assertPatchOpsSettingsAllowedForRole('mfa', body), { ok: true });
  assert.deepEqual(assertPatchOpsSettingsAllowedForRole('ops', body), { ok: true });
});

test('mfa may not patch routingMode', () => {
  assert.deepEqual(assertPatchOpsSettingsAllowedForRole('mfa', { routingMode: 'complex' }), {
    ok: false,
    forbiddenKeys: ['routingMode'],
  });
});

test('mfa may patch the simple post-waiting call target', () => {
  assert.deepEqual(
    assertPatchOpsSettingsAllowedForRole('mfa', { postWaitingCallTargetId: 'labor' }),
    { ok: true },
  );
});

test('unknown roles may not patch routingMode', () => {
  assert.deepEqual(assertPatchOpsSettingsAllowedForRole(undefined, { routingMode: 'complex' }), {
    ok: false,
    forbiddenKeys: ['routingMode'],
  });
});

test('MFA may configure the long-wait threshold', () => {
  assert.deepEqual(assertPatchOpsSettingsAllowedForRole('mfa', { longWaitThresholdMinutes: 40 }), {
    ok: true,
  });
  assert.deepEqual(assertPatchOpsSettingsAllowedForRole('ops', { longWaitThresholdMinutes: 40 }), {
    ok: false,
    forbiddenKeys: ['longWaitThresholdMinutes'],
  });
});
