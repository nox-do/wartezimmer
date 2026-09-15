import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveHttpDeviceAddress, persistedHttpHostname } from './device-address.js';

for (const port of [80, 8080]) {
  test(`HTTP address follows selected IP on port ${port}, retaining existing names only`, () => {
    const suffix = port === 80 ? '' : ':8080';
    for (const existingCanonical of [
      undefined,
      'http://192.168.0.2:8080',
      'http://127.0.0.1',
      'http://[::1]:8080',
    ]) {
      assert.equal(
        deriveHttpDeviceAddress({ lanIp: '192.168.0.83', port, existingCanonical }),
        `http://192.168.0.83${suffix}`,
      );
    }
    assert.equal(
      deriveHttpDeviceAddress({
        lanIp: '192.168.0.83',
        port,
        existingCanonical: 'http://practice.local:8080',
      }),
      `http://practice.local${suffix}`,
    );
  });
}

test('HTTPS and malformed URLs cannot become legacy HTTP names', () => {
  for (const value of [
    'https://staff.example.test',
    'http://user:password@practice.local',
    'http://practice.local/path',
    'http://practice.local?query=1',
    'invalid',
  ]) {
    assert.equal(persistedHttpHostname(value), null);
  }
});
