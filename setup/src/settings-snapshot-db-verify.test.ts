import assert from 'node:assert/strict';
import test from 'node:test';
import { buildExpectedDbSnapshotAfterImport } from './settings-snapshot-db-verify.js';

const baseSnapshot = {
  settingsFormatVersion: 1,
  exportedAt: '2026-07-12T12:00:00.000Z',
  opsSettings: { routingMode: 'simple' },
  authSettings: { staffPinHashMfa: 'a' },
  messagingProviderConfigs: [
    {
      providerId: 'seven',
      channel: 'sms',
      enabled: true,
      credentialsJson: '{"apiKey":"secret"}',
    },
    {
      providerId: 'mock',
      channel: 'sms',
      enabled: true,
      credentialsJson: '{}',
    },
  ],
};

test('buildExpectedDbSnapshotAfterImport strips provider credentials when requested', () => {
  const expected = buildExpectedDbSnapshotAfterImport(baseSnapshot, {
    skipProviderCredentials: true,
  });

  assert.deepEqual(expected.messagingProviderConfigs, [
    {
      providerId: 'seven',
      channel: 'sms',
      enabled: false,
      credentialsJson: '{}',
    },
    {
      providerId: 'mock',
      channel: 'sms',
      enabled: true,
      credentialsJson: '{}',
    },
  ]);
});

test('buildExpectedDbSnapshotAfterImport leaves providers unchanged by default', () => {
  const expected = buildExpectedDbSnapshotAfterImport(baseSnapshot);
  assert.deepEqual(expected.messagingProviderConfigs, baseSnapshot.messagingProviderConfigs);
});
