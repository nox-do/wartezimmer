import assert from 'node:assert/strict';
import test from 'node:test';
import { isWeakGeneratedSecret, resolveSecretsForEnv } from './secrets.js';

test('isWeakGeneratedSecret rejects placeholder and short captive keys', () => {
  assert.equal(isWeakGeneratedSecret('AUTH_KEY_CAPTIVE', 'change-me-captive-key'), true);
  assert.equal(isWeakGeneratedSecret('AUTH_KEY_CAPTIVE', 'short-token'), true);
  assert.equal(isWeakGeneratedSecret('SANDBOX_INTERNAL_TOKEN', 'change-me'), true);
});

test('resolveSecretsForEnv regenerates weak placeholders even when preserving env', () => {
  const result = resolveSecretsForEnv(
    new Map([
      ['AUTH_KEY_CAPTIVE', 'change-me-captive-key'],
      ['MAINTENANCE_TOKEN', 'change-me-maintenance-token'],
      ['SANDBOX_INTERNAL_TOKEN', 'change-me-sandbox-internal-token'],
      ['OPENNDS_FAS_KEY', 'change-me'],
    ]),
    { preserve: true },
  );

  assert.deepEqual(result.kept, []);
  assert.deepEqual(result.generated, [
    'AUTH_KEY_CAPTIVE',
    'MAINTENANCE_TOKEN',
    'SANDBOX_INTERNAL_TOKEN',
    'OPENNDS_FAS_KEY',
  ]);
  assert.notEqual(result.secrets.AUTH_KEY_CAPTIVE, 'change-me-captive-key');
  assert.equal(result.secrets.AUTH_KEY_CAPTIVE.length >= 32, true);
});

test('resolveSecretsForEnv keeps strong existing secrets when preserving env', () => {
  const result = resolveSecretsForEnv(
    new Map([
      ['AUTH_KEY_CAPTIVE', 'a'.repeat(32)],
      ['MAINTENANCE_TOKEN', 'm'.repeat(32)],
      ['SANDBOX_INTERNAL_TOKEN', 'b'.repeat(32)],
      ['OPENNDS_FAS_KEY', 'c'.repeat(16)],
    ]),
    { preserve: true },
  );

  assert.deepEqual(result.generated, []);
  assert.deepEqual(result.kept, [
    'AUTH_KEY_CAPTIVE',
    'MAINTENANCE_TOKEN',
    'SANDBOX_INTERNAL_TOKEN',
    'OPENNDS_FAS_KEY',
  ]);
  assert.equal(result.secrets.AUTH_KEY_CAPTIVE, 'a'.repeat(32));
});
