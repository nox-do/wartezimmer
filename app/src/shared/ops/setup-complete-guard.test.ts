import assert from 'node:assert/strict';
import test from 'node:test';
import type { OpsSettings } from '../db/db-types.js';
import { assertSyncSetupReadyForComplete } from './setup-complete-guard.js';

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

test('assertSyncSetupReadyForComplete requires practice displayName', () => {
  assert.throws(
    () => assertSyncSetupReadyForComplete(baseSettings({ practiceProfileJson: '{}' }), 'sample'),
    (error: unknown) =>
      error instanceof Error && error.message.includes('SETUP_REQUIRED_CHECKS_INCOMPLETE'),
  );
});

test('assertSyncSetupReadyForComplete passes with displayName and contact CSV', () => {
  assert.doesNotThrow(() => assertSyncSetupReadyForComplete(baseSettings(), 'sample'));
});
