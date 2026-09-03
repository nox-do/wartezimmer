import assert from 'node:assert/strict';
import type { StatementSync } from 'node:sqlite';
import test from 'node:test';
import { DEFAULT_ROOM_PANELS_SETTINGS } from '@praxis-flow/domain';
import { getOpsSettingsFromDb, updateOpsSettingsInDb } from './database-ops-settings.js';
import { OpsSettingsValidationError, opsSettingsInvalidHttpStatus } from './ops-settings-errors.js';

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

test('getOpsSettingsFromDb defaults missing routingMode to simple', () => {
  const settings = getOpsSettingsFromDb({
    getOpsSettingsStmt: {
      get: () => minimalOpsSettingsRow(),
    } as StatementSync,
    configuredExportBasePath: null,
  });

  assert.equal(settings.routingMode, 'simple');
});

test('getOpsSettingsFromDb reads stored complex routingMode', () => {
  const settings = getOpsSettingsFromDb({
    getOpsSettingsStmt: {
      get: () => minimalOpsSettingsRow({ routingMode: 'complex' }),
    } as StatementSync,
    configuredExportBasePath: null,
  });

  assert.equal(settings.routingMode, 'complex');
});

test('updateOpsSettingsInDb persists routingMode and returns the saved value', () => {
  const savedArgs: unknown[][] = [];
  const settings = updateOpsSettingsInDb(
    {
      getOpsSettingsStmt: {
        get: () => minimalOpsSettingsRow(),
      } as StatementSync,
      updateOpsSettingsStmt: {
        run: (...args: unknown[]) => {
          savedArgs.push(args);
        },
      } as StatementSync,
      nowIso: () => '2026-01-01T01:00:00.000Z',
      configuredExportBasePath: null,
    },
    { routingMode: 'complex' },
  );

  assert.equal(settings.routingMode, 'complex');
  assert.equal(savedArgs.length, 1);
  assert.equal(savedArgs[0]?.[0], 'complex');
});

test('opsSettingsInvalidHttpStatus maps routing mode guard to 409', () => {
  assert.equal(opsSettingsInvalidHttpStatus('ROUTING_MODE_CHANGE_BLOCKED'), 409);
  assert.equal(opsSettingsInvalidHttpStatus('INVALID_ARGUMENT'), 400);
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

test('getOpsSettingsFromDb defaults missing panels to DEFAULT_ROOM_PANELS_SETTINGS', () => {
  const settings = getOpsSettingsFromDb({
    getOpsSettingsStmt: {
      get: () => minimalOpsSettingsRow(),
    } as StatementSync,
    configuredExportBasePath: null,
  });

  assert.deepEqual(settings.rooms[0]?.panels, DEFAULT_ROOM_PANELS_SETTINGS);
});

test('getOpsSettingsFromDb applies outside constraints on panels', () => {
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
              panels: {
                outside: {
                  enabled: true,
                  mode: 'staff_full',
                  showPatientNames: true,
                  allowCalling: true,
                },
                inside: {
                  enabled: true,
                  mode: 'staff_full',
                  showPatientNames: true,
                  allowCalling: true,
                },
              },
            },
          ]),
        }),
    } as StatementSync,
    configuredExportBasePath: null,
  });

  const room = settings.rooms.find((entry) => entry.roomId === 'empfang');
  assert.equal(room?.panels.outside.mode, 'arrival');
  assert.equal(room?.panels.outside.showPatientNames, false);
  assert.equal(room?.panels.outside.allowCalling, false);
  assert.equal(room?.panels.inside.mode, 'staff_full');
  assert.equal(room?.panels.inside.showPatientNames, true);
  assert.equal(room?.panels.inside.allowCalling, true);
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
