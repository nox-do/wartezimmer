import assert from 'node:assert/strict';
import type { StatementSync } from 'node:sqlite';
import test from 'node:test';
import { ensureSingleDefaultCallTarget, getOpsSettingsFromDb } from './database-ops-settings.js';
import { OpsSettingsValidationError } from './ops-settings-errors.js';

function minimalOpsSettingsRow(overrides?: Record<string, unknown>) {
  return {
    updatedAt: '2026-01-01T00:00:00.000Z',
    smsProvider: 'mock',
    exportBasePath: '/tmp',
    practiceOpenFrom: '00:00',
    practiceOpenTo: '23:59',
    topicSettingsJson:
      '[{"topicId":"offen","label":"Offen","laneCode":"O","defaultRoomId":"empfang","enabled":true,"sortOrder":1}]',
    roomsJson:
      '[{"roomId":"empfang","roomLabel":"Empfang","enabled":true,"defaultCallTarget":true}]',
    contactLookupDelimiterMode: 'auto',
    contactLookupHasHeader: 1,
    contactLookupMappingJson: '{}',
    emergencyEnabled: 1,
    terminalWlanPromoEnabled: 0,
    terminalAuthPhoneEnabled: 1,
    terminalAuthNameDobEnabled: 0,
    terminalAuthEgkEnabled: 0,
    ...overrides,
  };
}

test('getOpsSettingsFromDb maps sqlite booleans strictly as value === 1', () => {
  const settings = getOpsSettingsFromDb({
    getOpsSettingsStmt: {
      get: () =>
        minimalOpsSettingsRow({
          terminalAuthPhoneEnabled: 0,
          terminalAuthNameDobEnabled: 2,
          terminalAuthEgkEnabled: null,
        }),
    } as StatementSync,
    configuredExportBasePath: null,
  });

  assert.equal(settings.terminalAuthPhoneEnabled, false);
  assert.equal(settings.terminalAuthNameDobEnabled, false);
  assert.equal(settings.terminalAuthEgkEnabled, false);
});

test('getOpsSettingsFromDb treats only 1 as enabled for terminal auth flags', () => {
  const settings = getOpsSettingsFromDb({
    getOpsSettingsStmt: {
      get: () =>
        minimalOpsSettingsRow({
          terminalAuthPhoneEnabled: 1,
          terminalAuthNameDobEnabled: 1,
          terminalAuthEgkEnabled: 1,
        }),
    } as StatementSync,
    configuredExportBasePath: null,
  });

  assert.equal(settings.terminalAuthPhoneEnabled, true);
  assert.equal(settings.terminalAuthNameDobEnabled, true);
  assert.equal(settings.terminalAuthEgkEnabled, true);
});

test('getOpsSettingsFromDb migrates legacy room panel settings without exposing names outside', () => {
  const settings = getOpsSettingsFromDb({
    getOpsSettingsStmt: {
      get: () =>
        minimalOpsSettingsRow({
          roomsJson: JSON.stringify([
            {
              roomId: 'empfang',
              roomLabel: 'Empfang',
              enabled: true,
              defaultCallTarget: true,
              panel: {
                enabled: true,
                mode: 'patient_arrival',
                showPatientNames: false,
                arrivalTextPreset: 'custom',
                arrivalTextCustom: 'Bitte eintreten',
                waitingTextPreset: 'please_wait_here',
                waitingTextCustom: null,
              },
            },
            {
              roomId: 'labor',
              roomLabel: 'Labor',
              enabled: true,
              defaultCallTarget: false,
              panel: {
                enabled: true,
                mode: 'display_only',
                showPatientNames: true,
                arrivalTextPreset: 'please_enter',
                waitingTextPreset: 'please_wait_here',
              },
            },
            {
              roomId: 'behandlung',
              roomLabel: 'Behandlung',
              enabled: true,
              defaultCallTarget: false,
              panel: {
                enabled: true,
                placement: 'outside',
                mode: 'staff_full',
                showPatientNames: true,
                calledTextPreset: 'please_enter',
                arrivedTextPreset: 'please_wait_here',
              },
            },
          ]),
        }),
    } as StatementSync,
    configuredExportBasePath: null,
  });

  const migratedArrival = settings.rooms.find((room) => room.roomId === 'empfang')?.panel;
  assert.equal(migratedArrival?.placement, 'inside');
  assert.equal(migratedArrival?.mode, 'arrival');
  assert.equal(migratedArrival?.calledTextPreset, 'custom');
  assert.equal(migratedArrival?.calledTextCustom, 'Bitte eintreten');

  const inside = settings.rooms.find((room) => room.roomId === 'labor')?.panel;
  assert.equal(inside?.placement, 'inside');
  assert.equal(inside?.showPatientNames, true);

  const malformedOutside = settings.rooms.find((room) => room.roomId === 'behandlung')?.panel;
  assert.equal(malformedOutside?.mode, 'arrival');
  assert.equal(malformedOutside?.showPatientNames, false);
});

test('ensureSingleDefaultCallTarget re-export matches domain package', () => {
  const rooms = ensureSingleDefaultCallTarget(
    [
      {
        roomId: 'empfang',
        roomLabel: 'Empfang',
        enabled: true,
        defaultCallTarget: true,
        maxOccupancy: null,
      },
      {
        roomId: 'labor',
        roomLabel: 'Labor',
        enabled: true,
        defaultCallTarget: false,
        maxOccupancy: null,
      },
    ],
    'labor',
  );

  assert.equal(rooms.find((room) => room.roomId === 'labor')?.defaultCallTarget, true);
  assert.equal(rooms.find((room) => room.roomId === 'empfang')?.defaultCallTarget, false);
});

test('getOpsSettingsFromDb rejects reserved mfa topic id in configurable topic settings', () => {
  assert.throws(
    () =>
      getOpsSettingsFromDb({
        getOpsSettingsStmt: {
          get: () =>
            minimalOpsSettingsRow({
              topicSettingsJson:
                '[{"topicId":"mfa","label":"Zur MFA","laneCode":"M","defaultRoomId":"empfang","enabled":true,"sortOrder":1}]',
            }),
        } as StatementSync,
        configuredExportBasePath: null,
      }),
    (error: unknown) => error instanceof OpsSettingsValidationError,
  );
});
