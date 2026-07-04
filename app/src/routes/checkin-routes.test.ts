import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import type { CoreDatabase } from '../shared/db/database.js';
import { registerCheckinRoutes } from './checkin-routes.js';

function fakeCheckinDb(overrides?: {
  terminalAuthPhoneEnabled?: boolean;
  terminalAuthNameDobEnabled?: boolean;
  onCreateTicket?: (input: { identityRef?: string; authPath: string; checkinLocale?: string | null }) => void;
}): CoreDatabase {
  return {
    getOpsSettings: () => ({
      terminalAuthPhoneEnabled: overrides?.terminalAuthPhoneEnabled ?? true,
      terminalAuthNameDobEnabled: overrides?.terminalAuthNameDobEnabled ?? false,
      terminalAuthEgkEnabled: false,
      contactLookupFolderPath: null,
      contactLookupDelimiterMode: 'auto' as const,
      contactLookupHasHeader: true,
      contactLookupMappingJson: '{"mobile":"mobil"}',
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
      practiceOpenFrom: '00:00',
      practiceOpenTo: '23:59',
    }),
    isCheckinLocked: () => false,
    isEffectiveCheckinLocked: () => false,
    listQueue: () => [],
    createTicket: (input) => {
      overrides?.onCreateTicket?.(input);
      return {
        ticketId: '20260617-O-001',
        number: 1,
        createdAt: '2026-06-17T12:00:00.000Z',
      };
    },
  } as unknown as CoreDatabase;
}

test('POST /api/v1/checkins rejects disabled terminal auth path', async () => {
  const app = Fastify({ logger: false });
  registerCheckinRoutes(app, fakeCheckinDb({ terminalAuthPhoneEnabled: false }));

  await app.ready();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/checkins',
    payload: {
      topicId: 'offen',
      authPath: 'phone_dob',
      phoneNumber: '+4915123456789',
    },
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().code, 'CHECKIN_AUTH_PATH_DISABLED');
  await app.close();
});

test('POST /api/v1/checkins rejects disabled name_dob auth path', async () => {
  const app = Fastify({ logger: false });
  registerCheckinRoutes(app, fakeCheckinDb({ terminalAuthNameDobEnabled: false }));

  await app.ready();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/checkins',
    payload: {
      topicId: 'offen',
      authPath: 'name_dob',
      lastName: 'Mustermann',
      birthDate: '01.01.1980',
    },
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().code, 'CHECKIN_AUTH_PATH_DISABLED');
  await app.close();
});

test('POST /api/v1/checkins rejects name_dob without last name', async () => {
  const app = Fastify({ logger: false });
  registerCheckinRoutes(app, fakeCheckinDb({ terminalAuthNameDobEnabled: true }));

  await app.ready();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/checkins',
    payload: {
      topicId: 'offen',
      authPath: 'name_dob',
      birthDate: '01.01.1980',
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().code, 'TERMINAL_LAST_NAME_INVALID');
  await app.close();
});

test('POST /api/v1/checkins rejects name_dob without birth date', async () => {
  const app = Fastify({ logger: false });
  registerCheckinRoutes(app, fakeCheckinDb({ terminalAuthNameDobEnabled: true }));

  await app.ready();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/checkins',
    payload: {
      topicId: 'offen',
      authPath: 'name_dob',
      lastName: 'Mustermann',
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().code, 'TERMINAL_BIRTH_DATE_INVALID');
  await app.close();
});

test('POST /api/v1/checkins stores typed last name when name_dob has no CSV match', async () => {
  let capturedIdentityRef: string | undefined;
  const app = Fastify({ logger: false });
  registerCheckinRoutes(
    app,
    fakeCheckinDb({
      terminalAuthNameDobEnabled: true,
      onCreateTicket: (input) => {
        capturedIdentityRef = input.identityRef;
      },
    }),
  );

  await app.ready();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/checkins',
    payload: {
      topicId: 'offen',
      authPath: 'name_dob',
      lastName: 'Mustermann',
      birthDate: '01.01.1980',
    },
  });

  assert.equal(response.statusCode, 201);
  assert.equal(capturedIdentityRef, 'Mustermann');
  await app.close();
});

test('POST /api/v1/checkins forwards terminal patient locale when provided', async () => {
  let capturedCheckinLocale: string | null | undefined;
  const app = Fastify({ logger: false });
  registerCheckinRoutes(
    app,
    fakeCheckinDb({
      onCreateTicket: (input) => {
        capturedCheckinLocale = input.checkinLocale;
      },
    }),
  );

  await app.ready();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/checkins',
    headers: {
      'x-patient-locale': 'tr-TR',
    },
    payload: {
      topicId: 'offen',
      authPath: 'phone_dob',
      phoneNumber: '+4915123456789',
    },
  });

  assert.equal(response.statusCode, 201);
  assert.equal(capturedCheckinLocale, 'tr-TR');
  await app.close();
});

test('POST /api/v1/checkins rejects unknown auth path', async () => {
  const app = Fastify({ logger: false });
  registerCheckinRoutes(app, fakeCheckinDb());

  await app.ready();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/checkins',
    payload: {
      topicId: 'offen',
      authPath: 'custom',
      phoneNumber: '+4915123456789',
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().code, 'FST_ERR_VALIDATION');
  await app.close();
});
