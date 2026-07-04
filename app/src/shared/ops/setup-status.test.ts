import assert from 'node:assert/strict';
import test from 'node:test';
import type { OpsSettings } from '../db/db-types.js';
import { buildSetupStatusSnapshot } from './setup-status.js';

function baseSettings(overrides: Partial<OpsSettings> = {}): OpsSettings {
  return {
    returnWindowMinutes: 15,
    practiceOpenFrom: '00:00',
    practiceOpenTo: '23:59',
    topics: [],
    rooms: [],
    contactLookupFolderPath: '/imports',
    contactLookupDelimiterMode: 'auto',
    contactLookupHasHeader: true,
    contactLookupMappingJson: '{"mobile":"mobil"}',
    practiceProfileJson: '{"displayName":"Praxis Muster"}',
    emergencyEnabled: true,
    terminalWlanPromoEnabled: false,
    terminalAuthPhoneEnabled: true,
    terminalAuthNameDobEnabled: false,
    terminalAuthEgkEnabled: false,
    smsProvider: 'mock',
    exportBasePath: '/exports',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const setupRow = {
  setupCompletedAt: null,
  setupLastStep: 'verify' as const,
  portalEnabled: false,
  setupContactMode: 'sample' as const,
};

test('buildSetupStatusSnapshot marks practiceProfile check failed without displayName', async () => {
  const db = {
    getOpsSettings: () => baseSettings({ practiceProfileJson: '{}' }),
    getMessagingProviderCatalog: () => ({ channels: [] }),
  };

  const snapshot = await buildSetupStatusSnapshot(db, setupRow, { verify: true });
  const practiceCheck = snapshot.checks.find((check) => check.id === 'practiceProfile.configured');

  assert.equal(practiceCheck?.ok, false);
  assert.equal(practiceCheck?.hint, 'PRACTICE_PROFILE_DISPLAY_NAME_MISSING');
  assert.equal(snapshot.requiredChecksOk, false);
});

test('buildSetupStatusSnapshot includes practiceProfile in required checks when configured', async () => {
  const db = {
    getOpsSettings: () => baseSettings(),
    getMessagingProviderCatalog: () => ({ channels: [] }),
  };

  const snapshot = await buildSetupStatusSnapshot(db, setupRow, { verify: false });
  const practiceCheck = snapshot.checks.find((check) => check.id === 'practiceProfile.configured');

  assert.equal(practiceCheck?.ok, true);
  assert.equal(practiceCheck?.required, true);
});
