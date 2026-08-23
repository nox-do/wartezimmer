import assert from 'node:assert/strict';
import test from 'node:test';
import { settingsDbSnapshotsEquivalentForRestore } from './settings-db-snapshot.js';

function content(overrides: Record<string, unknown> = {}) {
  return {
    opsSettings: { routingMode: 'simple' },
    authSettings: { staffPinHashMfa: 'a' },
    messagingProviderConfigs: [{ providerId: 'seven' }],
    ...overrides,
  };
}

test('settingsDbSnapshotsEquivalentForRestore accepts matching restore content', () => {
  assert.equal(settingsDbSnapshotsEquivalentForRestore(content(), content()), true);
});

test('settingsDbSnapshotsEquivalentForRestore ignores exportedAt and settingsFormatVersion', () => {
  assert.equal(
    settingsDbSnapshotsEquivalentForRestore(
      { ...content(), exportedAt: '2026-07-12T12:00:00.000Z', settingsFormatVersion: 1 },
      { ...content(), exportedAt: '2026-08-23T08:00:00.000Z', settingsFormatVersion: 2 },
    ),
    true,
  );
});

test('settingsDbSnapshotsEquivalentForRestore ignores env', () => {
  assert.equal(
    settingsDbSnapshotsEquivalentForRestore(
      { ...content(), env: { BUSINESS_TZ: 'Europe/Berlin' } },
      { ...content(), env: { BUSINESS_TZ: 'UTC' } },
    ),
    true,
  );
});

test('settingsDbSnapshotsEquivalentForRestore detects a change in each restore area', () => {
  assert.equal(
    settingsDbSnapshotsEquivalentForRestore(
      content(),
      content({ opsSettings: { routingMode: 'complex' } }),
    ),
    false,
  );
  assert.equal(
    settingsDbSnapshotsEquivalentForRestore(
      content(),
      content({ authSettings: { staffPinHashMfa: 'b' } }),
    ),
    false,
  );
  assert.equal(
    settingsDbSnapshotsEquivalentForRestore(content(), content({ messagingProviderConfigs: [] })),
    false,
  );
});

test('settingsDbSnapshotsEquivalentForRestore treats array order as significant', () => {
  assert.equal(
    settingsDbSnapshotsEquivalentForRestore(
      content({ messagingProviderConfigs: [{ providerId: 'seven' }, { providerId: 'mock' }] }),
      content({ messagingProviderConfigs: [{ providerId: 'mock' }, { providerId: 'seven' }] }),
    ),
    false,
  );
});
