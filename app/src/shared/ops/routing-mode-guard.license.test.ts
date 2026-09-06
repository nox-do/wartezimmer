import assert from 'node:assert/strict';
import test from 'node:test';
import { validateComplexRoutingLicenseChange } from './routing-mode-guard.js';

test('validateComplexRoutingLicenseChange allows simple mode without license', () => {
  const previous = process.env.COMPLEX_ROUTING_LICENSED;
  process.env.COMPLEX_ROUTING_LICENSED = 'false';
  try {
    assert.deepEqual(validateComplexRoutingLicenseChange({ nextMode: 'simple' }), { ok: true });
  } finally {
    if (previous === undefined) {
      delete process.env.COMPLEX_ROUTING_LICENSED;
    } else {
      process.env.COMPLEX_ROUTING_LICENSED = previous;
    }
  }
});

test('validateComplexRoutingLicenseChange allows complex mode in production by default', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previous = process.env.COMPLEX_ROUTING_LICENSED;
  process.env.NODE_ENV = 'production';
  delete process.env.COMPLEX_ROUTING_LICENSED;
  try {
    const result = validateComplexRoutingLicenseChange({ nextMode: 'complex' });
    assert.equal(result.ok, true);
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
    if (previous === undefined) {
      delete process.env.COMPLEX_ROUTING_LICENSED;
    } else {
      process.env.COMPLEX_ROUTING_LICENSED = previous;
    }
  }
});

test('validateComplexRoutingLicenseChange blocks complex mode without license when explicitly disabled', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previous = process.env.COMPLEX_ROUTING_LICENSED;
  process.env.NODE_ENV = 'production';
  process.env.COMPLEX_ROUTING_LICENSED = 'false';
  try {
    const result = validateComplexRoutingLicenseChange({ nextMode: 'complex' });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 'COMPLEX_ROUTING_NOT_LICENSED');
    }
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
    if (previous === undefined) {
      delete process.env.COMPLEX_ROUTING_LICENSED;
    } else {
      process.env.COMPLEX_ROUTING_LICENSED = previous;
    }
  }
});
