import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_ROOM_PANELS_SETTINGS, normalizeRoomPanelsSettings } from '@praxis-flow/domain';
import type { PatchOpsSettingsBody } from '../../api/ops-openapi-types.js';
import type { CoreDatabase } from '../../shared/db/database.js';
import { buildOpsSettingsUpdate } from './ops-settings-mapper.js';

function mockDb(): CoreDatabase {
  return {
    getOpsSettings: () => ({
      routingMode: 'simple',
      returnWindowMinutes: 15,
      practiceOpenFrom: '00:00',
      practiceOpenTo: '23:59',
      topics: [
        {
          topicId: 'offen',
          label: 'Offen',
          laneCode: 'O',
          defaultRoomId: 'empfang',
          iconId: null,
          accentColor: '#000000',
          enabled: true,
          availableFrom: null,
          availableTo: null,
          sortOrder: 1,
        },
      ],
      rooms: [
        {
          roomId: 'empfang',
          roomLabel: 'Empfang',
          enabled: true,
          defaultCallTarget: true,
          maxOccupancy: null,
          panels: DEFAULT_ROOM_PANELS_SETTINGS,
        },
      ],
      contactLookupFolderPath: null,
      contactLookupDelimiterMode: 'auto',
      contactLookupHasHeader: true,
      contactLookupMappingJson:
        '{"mobile":"mobil","firstName":"vorname","lastName":"nachname","birthDate":"geburtsdatum"}',
      practiceProfileJson: '{}',
      emergencyEnabled: true,
      terminalWlanPromoEnabled: false,
      terminalAuthPhoneEnabled: true,
      terminalAuthNameDobEnabled: false,
      terminalAuthEgkEnabled: false,
      smsProvider: 'mock',
      exportBasePath: '/tmp',
      journeySettings: { templates: [] },
      updatedAt: '2026-01-01T00:00:00.000Z',
    }),
  } as unknown as CoreDatabase;
}

test('buildOpsSettingsUpdate normalizes journeySettings patch', async () => {
  const result = await buildOpsSettingsUpdate(mockDb(), {
    journeySettings: {
      templates: [
        {
          id: 'journey_labor',
          name: 'Labor',
          topicId: null,
          active: true,
          steps: [
            {
              id: 'step-1',
              sortOrder: 0,
              targetLocationId: 'empfang',
              queueId: null,
              movementMode: 'call',
              publicDisplayMode: 'visible',
              completedWhen: 'arrive',
              instructionText: null,
            },
          ],
        },
      ],
    },
  });

  assert.ok(result && !('code' in result));
  if ('code' in result) {
    return;
  }

  assert.equal(result.journeySettings?.templates.length, 1);
  assert.equal(result.journeySettings?.templates[0]?.id, 'journey_labor');
  assert.equal(result.journeySettings?.templates[0]?.steps[0]?.movementMode, 'call');
});

test('buildOpsSettingsUpdate does not revalidate an unchanged unavailable contact import', async () => {
  const db = {
    getOpsSettings: () => ({
      ...mockDb().getOpsSettings(),
      contactLookupFolderPath: '/unavailable/contact-import',
    }),
  } as unknown as CoreDatabase;

  const result = await buildOpsSettingsUpdate(db, { emergencyEnabled: false });

  assert.ok(result && !('code' in result));
  if (!result || 'code' in result) {
    return;
  }
  assert.equal(result.emergencyEnabled, false);
});

test('buildOpsSettingsUpdate still validates an explicitly changed contact import', async () => {
  const db = {
    getOpsSettings: () => ({
      ...mockDb().getOpsSettings(),
      contactLookupFolderPath: '/unavailable/contact-import',
    }),
  } as unknown as CoreDatabase;

  const result = await buildOpsSettingsUpdate(db, { contactLookupDelimiterMode: 'semicolon' });

  assert.ok(result && 'code' in result);
  if (!result || !('code' in result)) {
    return;
  }
  assert.equal(result.code, 'INVALID_ARGUMENT');
  assert.match(result.message, /contact lookup/i);
});

test('buildOpsSettingsUpdate allows clearing the contact import path explicitly', async () => {
  const db = {
    getOpsSettings: () => ({
      ...mockDb().getOpsSettings(),
      contactLookupFolderPath: '/unavailable/contact-import',
    }),
  } as unknown as CoreDatabase;

  const result = await buildOpsSettingsUpdate(db, { contactLookupFolderPath: null });

  assert.ok(result && !('code' in result));
  if (!result || 'code' in result) {
    return;
  }
  assert.equal(result.contactLookupFolderPath, null);
});

test('buildOpsSettingsUpdate rejects invalid journeySettings patch', async () => {
  const result = await buildOpsSettingsUpdate(mockDb(), {
    journeySettings: {
      templates: [
        {
          id: 'journey_labor',
          name: 'Labor',
          topicId: null,
          active: true,
          steps: [
            {
              id: 'step-1',
              sortOrder: 0,
              targetLocationId: 'empfang',
              queueId: null,
              movementMode: 'invalid-mode',
              publicDisplayMode: 'visible',
              completedWhen: 'arrive',
              instructionText: null,
            },
          ],
        },
      ],
    },
  });

  assert.ok(result && 'code' in result);
  if (!result || !('code' in result)) {
    return;
  }
  assert.equal(result.code, 'INVALID_ARGUMENT');
  assert.match(result.message, /journeySettings/i);
});

test('buildOpsSettingsUpdate preserves maxOccupancy on rooms patch', async () => {
  const result = await buildOpsSettingsUpdate(mockDb(), {
    rooms: [
      {
        roomId: 'empfang',
        roomLabel: 'Empfang',
        enabled: true,
        defaultCallTarget: true,
        maxOccupancy: 1,
      },
    ],
  });

  assert.ok(result && !('code' in result));
  if ('code' in result) {
    return;
  }

  assert.equal(result.rooms?.find((room) => room.roomId === 'empfang')?.maxOccupancy, 1);
});

test('buildOpsSettingsUpdate preserves topic journeyTemplateId on topic base-data patch', async () => {
  const db = {
    getOpsSettings: () => ({
      ...mockDb().getOpsSettings(),
      topics: [
        {
          ...mockDb().getOpsSettings().topics[0]!,
          journeyTemplateId: 'journey_labor',
        },
      ],
    }),
  } as unknown as CoreDatabase;

  const result = await buildOpsSettingsUpdate(db, {
    topics: [
      {
        topicId: 'offen',
        label: 'Offen aktualisiert',
        laneCode: 'O',
        defaultRoomId: 'empfang',
        iconId: null,
        accentColor: '#000000',
        enabled: true,
        availableFrom: null,
        availableTo: null,
        sortOrder: 1,
      },
    ],
  });

  assert.ok(result && !('code' in result));
  if ('code' in result) {
    return;
  }

  assert.equal(result.topics?.[0]?.journeyTemplateId, 'journey_labor');
});

test('buildOpsSettingsUpdate allows clearing topic journeyTemplateId explicitly', async () => {
  const db = {
    getOpsSettings: () => ({
      ...mockDb().getOpsSettings(),
      topics: [
        {
          ...mockDb().getOpsSettings().topics[0]!,
          journeyTemplateId: 'journey_labor',
        },
      ],
    }),
  } as unknown as CoreDatabase;

  const result = await buildOpsSettingsUpdate(db, {
    topics: [
      {
        topicId: 'offen',
        journeyTemplateId: null,
      },
    ],
  });

  assert.ok(result && !('code' in result));
  if ('code' in result) {
    return;
  }

  assert.equal(result.topics?.[0]?.journeyTemplateId, null);
});

test('buildOpsSettingsUpdate preserves defaultCallTarget on rooms patch', async () => {
  const result = await buildOpsSettingsUpdate(mockDb(), {
    rooms: [
      { roomId: 'empfang', roomLabel: 'Empfang', enabled: true, defaultCallTarget: false },
      { roomId: 'labor', roomLabel: 'Labor', enabled: true, defaultCallTarget: true },
    ],
  });

  assert.ok(result && !('code' in result));
  if ('code' in result) {
    return;
  }

  const labor = result.rooms?.find((room) => room.roomId === 'labor');
  const empfang = result.rooms?.find((room) => room.roomId === 'empfang');
  assert.equal(labor?.defaultCallTarget, true);
  assert.equal(empfang?.defaultCallTarget, false);
});

test('buildOpsSettingsUpdate preserves panel settings on rooms patch', async () => {
  const db = {
    getOpsSettings: () => ({
      ...mockDb().getOpsSettings(),
      rooms: [
        {
          roomId: 'empfang',
          roomLabel: 'Empfang',
          enabled: true,
          defaultCallTarget: true,
          maxOccupancy: null,
          panels: normalizeRoomPanelsSettings({
            inside: {
              enabled: true,
              mode: 'staff_full',
              showPatientNames: true,
              calledTextPreset: 'custom',
              calledTextCustom: 'Bitte eintreten',
              arrivedTextPreset: 'please_wait_here',
              arrivedTextCustom: null,
            },
          }),
        },
      ],
    }),
  } as unknown as CoreDatabase;

  const result = await buildOpsSettingsUpdate(db, {
    rooms: [
      { roomId: 'empfang', roomLabel: 'Empfang neu', enabled: true, defaultCallTarget: true },
    ],
  });

  assert.ok(result && !('code' in result));
  if ('code' in result) {
    return;
  }

  const room = result.rooms?.find((entry) => entry.roomId === 'empfang');
  assert.equal(room?.panels.inside.enabled, true);
  assert.equal(room?.panels.inside.mode, 'staff_full');
  assert.equal(room?.panels.inside.showPatientNames, true);
  assert.equal(room?.panels.inside.calledTextCustom, 'Bitte eintreten');
});

test('buildOpsSettingsUpdate merges partial inside panel patch and preserves outside', async () => {
  const db = {
    getOpsSettings: () => ({
      ...mockDb().getOpsSettings(),
      rooms: [
        {
          roomId: 'empfang',
          roomLabel: 'Empfang',
          enabled: true,
          defaultCallTarget: true,
          maxOccupancy: null,
          panels: normalizeRoomPanelsSettings({
            outside: {
              enabled: true,
              mode: 'arrival',
              calledTextPreset: 'please_enter',
              calledTextCustom: 'Draußen warten',
            },
            inside: {
              enabled: true,
              mode: 'staff_full',
              showPatientNames: true,
              allowCalling: false,
            },
          }),
        },
      ],
    }),
  } as unknown as CoreDatabase;

  const result = await buildOpsSettingsUpdate(db, {
    rooms: [
      {
        roomId: 'empfang',
        roomLabel: 'Empfang',
        enabled: true,
        defaultCallTarget: true,
        panels: { inside: { allowCalling: true } },
      },
    ],
  });

  assert.ok(result && !('code' in result));
  if ('code' in result) {
    return;
  }

  const room = result.rooms?.find((entry) => entry.roomId === 'empfang');
  assert.equal(room?.panels.inside.allowCalling, true);
  assert.equal(room?.panels.inside.mode, 'staff_full');
  assert.equal(room?.panels.outside.enabled, true);
  assert.equal(room?.panels.outside.mode, 'arrival');
  assert.equal(room?.panels.outside.calledTextCustom, 'Draußen warten');
});

test('buildOpsSettingsUpdate normalizes outside constraints on partial outside patch', async () => {
  const db = {
    getOpsSettings: () => ({
      ...mockDb().getOpsSettings(),
      rooms: [
        {
          roomId: 'empfang',
          roomLabel: 'Empfang',
          enabled: true,
          defaultCallTarget: true,
          maxOccupancy: null,
          panels: normalizeRoomPanelsSettings({
            inside: {
              enabled: true,
              mode: 'staff_full',
              showPatientNames: true,
            },
          }),
        },
      ],
    }),
  } as unknown as CoreDatabase;

  const result = await buildOpsSettingsUpdate(db, {
    rooms: [
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
          },
        },
      },
    ],
  });

  assert.ok(result && !('code' in result));
  if ('code' in result) {
    return;
  }

  const room = result.rooms?.find((entry) => entry.roomId === 'empfang');
  assert.equal(room?.panels.outside.enabled, true);
  assert.equal(room?.panels.outside.mode, 'arrival');
  assert.equal(room?.panels.outside.showPatientNames, false);
  assert.equal(room?.panels.inside.enabled, true);
  assert.equal(room?.panels.inside.mode, 'staff_full');
});

test('buildOpsSettingsUpdate normalizes protected outside panel settings', async () => {
  const result = await buildOpsSettingsUpdate(mockDb(), {
    rooms: [
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
            calledTextPreset: 'please_enter',
            calledTextCustom: null,
            arrivedTextPreset: 'please_wait_here',
            arrivedTextCustom: null,
          },
        },
      },
    ],
  });

  if ('code' in result) {
    assert.fail(result.message);
  }

  const room = result.rooms?.find((entry) => entry.roomId === 'empfang');
  assert.equal(room?.panels.outside.enabled, true);
  assert.equal(room?.panels.outside.mode, 'arrival');
  assert.equal(room?.panels.outside.showPatientNames, false);
});

test('buildOpsSettingsUpdate represents a waiting-room default without a pseudo room', async () => {
  const result = await buildOpsSettingsUpdate(mockDb(), {
    rooms: [{ roomId: 'empfang', roomLabel: 'Empfang', enabled: true, defaultCallTarget: false }],
    topics: [{ topicId: 'offen', defaultRoomId: 'pf_waiting' }],
  });
  assert.ok(!('code' in result));
  if (!('code' in result)) {
    assert.equal(
      result.rooms?.some((room) => room.defaultCallTarget),
      false,
    );
    assert.equal(
      result.rooms?.some((room) => room.roomId === 'pf_waiting'),
      false,
    );
    assert.equal(result.topics?.[0]?.defaultRoomId, 'pf_waiting');
  }
});

test('buildOpsSettingsUpdate rejects reserved normal room ids and labels', async () => {
  const waitingLocationId = await buildOpsSettingsUpdate(mockDb(), {
    rooms: [
      { roomId: 'empfang', roomLabel: 'Empfang', enabled: true, defaultCallTarget: true },
      { roomId: 'pf_waiting', roomLabel: 'Nebenraum', enabled: true, defaultCallTarget: false },
    ],
  });
  assert.ok('code' in waitingLocationId);

  const reservedId = await buildOpsSettingsUpdate(mockDb(), {
    rooms: [
      { roomId: 'empfang', roomLabel: 'Empfang', enabled: true, defaultCallTarget: true },
      { roomId: 'waiting-room', roomLabel: 'Nebenraum', enabled: true, defaultCallTarget: false },
    ],
  });
  assert.ok('code' in reservedId);

  const reservedLabel = await buildOpsSettingsUpdate(mockDb(), {
    rooms: [
      { roomId: 'empfang', roomLabel: 'Empfang', enabled: true, defaultCallTarget: true },
      { roomId: 'raum-2', roomLabel: 'Wartezimmer', enabled: true, defaultCallTarget: false },
    ],
  });
  assert.ok('code' in reservedLabel);
});

test('buildOpsSettingsUpdate removes a legacy Wartezimmer room without mistaking its label for the system room', async () => {
  const db = {
    getOpsSettings: () => ({
      ...mockDb().getOpsSettings(),
      rooms: [
        ...mockDb().getOpsSettings().rooms,
        {
          roomId: 'legacy-wartezimmer',
          roomLabel: 'Wartezimmer',
          enabled: true,
          defaultCallTarget: false,
          maxOccupancy: null,
          panels: DEFAULT_ROOM_PANELS_SETTINGS,
        },
      ],
    }),
  } as unknown as CoreDatabase;
  const result = await buildOpsSettingsUpdate(db, {
    rooms: [{ roomId: 'empfang', roomLabel: 'Empfang', enabled: true, defaultCallTarget: true }],
  });
  assert.ok(!('code' in result));
});

test('buildOpsSettingsUpdate merges practiceProfile partial patch', async () => {
  const db = {
    getOpsSettings: () => ({
      ...mockDb().getOpsSettings(),
      practiceProfileJson:
        '{"displayName":"Alt","street":"Alte Str. 1","postalCode":"12345","city":"Berlin","phone":"","email":"","dataProtectionOfficer":"","website":""}',
    }),
  } as unknown as CoreDatabase;

  const result = await buildOpsSettingsUpdate(db, {
    practiceProfile: {
      displayName: 'Neu',
      phone: '030 123',
    },
  } as PatchOpsSettingsBody);

  assert.ok(result && !('code' in result));
  if ('code' in result) {
    return;
  }

  const parsed = JSON.parse(result.practiceProfileJson ?? '{}') as {
    displayName?: string;
    street?: string;
    phone?: string;
  };
  assert.equal(parsed.displayName, 'Neu');
  assert.equal(parsed.street, 'Alte Str. 1');
  assert.equal(parsed.phone, '030 123');
});

test('buildOpsSettingsUpdate rejects practiceProfile with empty displayName', async () => {
  const result = await buildOpsSettingsUpdate(mockDb(), {
    practiceProfile: {
      displayName: '',
      street: '',
      postalCode: '',
      city: '',
      phone: '',
      email: '',
      dataProtectionOfficer: '',
      website: '',
    },
  });

  assert.ok(result && 'code' in result);
  if (!result || !('code' in result)) {
    return;
  }
  assert.equal(result.code, 'INVALID_ARGUMENT');
  assert.match(result.message, /displayName/i);
});

test('waiting threshold accepts whole minutes and rejects out-of-range or fractional values', async () => {
  const valid = await buildOpsSettingsUpdate(mockDb(), { longWaitThresholdMinutes: 40 });
  assert.ok(!('code' in valid));
  if (!('code' in valid)) assert.equal(valid.longWaitThresholdMinutes, 40);
  for (const value of [0, 241, 1.5]) {
    const result = await buildOpsSettingsUpdate(mockDb(), { longWaitThresholdMinutes: value });
    assert.ok('code' in result);
    if ('code' in result) assert.equal(result.code, 'INVALID_ARGUMENT');
  }
});
