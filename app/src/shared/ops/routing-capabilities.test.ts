import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRoutingCapabilities } from './routing-capabilities.js';

test('resolveRoutingCapabilities disables complex and journey features in simple mode', () => {
  assert.deepEqual(resolveRoutingCapabilities({ routingMode: 'simple' }), {
    routingMode: 'simple',
    features: {
      complexRouting: false,
      journeyDesigner: false,
      routingSimulator: true,
      complexRoutingLicensed: true,
    },
  });
});

test('resolveRoutingCapabilities enables complex and journey features in complex mode', () => {
  assert.deepEqual(resolveRoutingCapabilities({ routingMode: 'complex' }), {
    routingMode: 'complex',
    features: {
      complexRouting: true,
      journeyDesigner: true,
      routingSimulator: true,
      complexRoutingLicensed: true,
    },
  });
});
