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

test('validateComplexRoutingLicenseChange blocks complex mode without license', () => {
  const previous = process.env.COMPLEX_ROUTING_LICENSED;
  process.env.COMPLEX_ROUTING_LICENSED = 'false';
  try {
    const result = validateComplexRoutingLicenseChange({ nextMode: 'complex' });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 'COMPLEX_ROUTING_NOT_LICENSED');
    }
  } finally {
    if (previous === undefined) {
      delete process.env.COMPLEX_ROUTING_LICENSED;
    } else {
      process.env.COMPLEX_ROUTING_LICENSED = previous;
    }
  }
});
