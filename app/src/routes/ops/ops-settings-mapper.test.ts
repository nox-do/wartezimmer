import assert from 'node:assert/strict';
import test from 'node:test';
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
      rooms: [{ roomId: 'empfang', roomLabel: 'Empfang', enabled: true, defaultCallTarget: true }],
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
              advanceOn: 'arrive',
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
              advanceOn: 'arrive',
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

  assert.equal(result.rooms?.[0]?.maxOccupancy, 1);
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
          panel: {
            enabled: true,
            placement: 'inside',
            mode: 'staff_full',
            showPatientNames: true,
            calledTextPreset: 'custom',
            calledTextCustom: 'Bitte eintreten',
            arrivedTextPreset: 'please_wait_here',
            arrivedTextCustom: null,
          },
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

  assert.equal(result.rooms?.[0]?.panel?.enabled, true);
  assert.equal(result.rooms?.[0]?.panel?.mode, 'staff_full');
  assert.equal(result.rooms?.[0]?.panel?.showPatientNames, true);
  assert.equal(result.rooms?.[0]?.panel?.calledTextCustom, 'Bitte eintreten');
});

test('buildOpsSettingsUpdate normalizes outside placement on partial panel patch', async () => {
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
          panel: {
            enabled: true,
            placement: 'inside',
            mode: 'staff_full',
            showPatientNames: true,
            calledTextPreset: 'please_enter',
            calledTextCustom: null,
            arrivedTextPreset: 'please_wait_here',
            arrivedTextCustom: null,
          },
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
        panel: { placement: 'outside' },
      },
    ],
  });

  assert.ok(result && !('code' in result));
  if ('code' in result) {
    return;
  }

  assert.equal(result.rooms?.[0]?.panel?.placement, 'outside');
  assert.equal(result.rooms?.[0]?.panel?.mode, 'arrival');
  assert.equal(result.rooms?.[0]?.panel?.showPatientNames, false);
});

test('buildOpsSettingsUpdate normalizes protected outside panel settings', async () => {
  const result = await buildOpsSettingsUpdate(mockDb(), {
    rooms: [
      {
        roomId: 'empfang',
        roomLabel: 'Empfang',
        enabled: true,
        defaultCallTarget: true,
        panel: {
          enabled: true,
          placement: 'outside',
          mode: 'staff_full',
          showPatientNames: true,
          calledTextPreset: 'please_enter',
          calledTextCustom: null,
          arrivedTextPreset: 'please_wait_here',
          arrivedTextCustom: null,
        },
      },
    ],
  });

  if ('code' in result) {
    assert.fail(result.message);
  }

  assert.equal(result.rooms?.[0]?.panel?.placement, 'outside');
  assert.equal(result.rooms?.[0]?.panel?.mode, 'arrival');
  assert.equal(result.rooms?.[0]?.panel?.showPatientNames, false);
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
