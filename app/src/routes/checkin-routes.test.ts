import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import type { CoreDatabase } from '../shared/db/database.js';
import { registerCheckinRoutes } from './checkin-routes.js';

function fakeCheckinDb(overrides?: {
  terminalAuthPhoneEnabled?: boolean;
  registrationBlocked?: boolean;
  terminalAuthNameDobEnabled?: boolean;
  onCreateTicket?: (input: {
    topicId: string;
    identityRef?: string;
    authPath: string;
    checkinLocale?: string | null;
    needsAssistance?: boolean;
  }) => void;
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
    isRegistrationBlocked: () => overrides?.registrationBlocked ?? false,
    isCheckinLocked: () => false,
    isEffectiveCheckinLocked: () => false,
    listQueue: () => [],
    createTicket: (input) => {
      overrides?.onCreateTicket?.(input);
      return {
        visitId: '20260617-O-001',
        number: 1,
        queueStatus: 'directed',
        createdAt: '2026-06-17T12:00:00.000Z',
        destinationRoomLabel: 'Empfang',
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

test('POST /api/v1/checkins returns the effective queue status', async () => {
  const app = Fastify({ logger: false });
  registerCheckinRoutes(app, fakeCheckinDb());

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

  assert.equal(response.statusCode, 201);
  assert.equal(response.json().queueStatus, 'directed');
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

test('POST /api/v1/checkins accepts none auth path for direct MFA topic check-in', async () => {
  let capturedAuthPath: string | undefined;
  let capturedTopicId: string | undefined;
  let capturedNeedsAssistance: boolean | undefined;
  const app = Fastify({ logger: false });
  registerCheckinRoutes(
    app,
    fakeCheckinDb({
      onCreateTicket: (input) => {
        capturedAuthPath = input.authPath;
        capturedTopicId = input.topicId;
        capturedNeedsAssistance = input.needsAssistance;
      },
    }),
  );

  await app.ready();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/checkins',
    payload: {
      topicId: 'mfa',
      authPath: 'none',
    },
  });

  assert.equal(response.statusCode, 201);
  assert.equal(capturedAuthPath, 'none');
  assert.equal(capturedTopicId, 'mfa');
  assert.equal(capturedNeedsAssistance, undefined);
  await app.close();
});

test('POST /api/v1/checkins/assistance creates an M ticket with Assistance-Flag', async () => {
  let capturedTopicId: string | undefined;
  let capturedNeedsAssistance: boolean | undefined;
  const app = Fastify({ logger: false });
  registerCheckinRoutes(
    app,
    fakeCheckinDb({
      onCreateTicket: (input) => {
        capturedTopicId = input.topicId;
        capturedNeedsAssistance = input.needsAssistance;
      },
    }),
  );

  await app.ready();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/checkins/assistance',
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.json().laneCode, 'M');
  assert.equal(capturedTopicId, 'mfa');
  assert.equal(capturedNeedsAssistance, true);
  await app.close();
});

test('topics API supplies lane blocking state including reception without hiding topics', async () => {
  const app = Fastify({ logger: false });
  registerCheckinRoutes(app, fakeCheckinDb({ registrationBlocked: true }));
  try {
    const response = await app.inject({ method: 'GET', url: '/api/v1/checkins/topics' });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().receptionRegistrationBlocked, true);
    assert.equal(response.json().topics[0].registrationBlocked, true);
    assert.equal(response.json().topics[0].topicId, 'offen');
  } finally {
    await app.close();
  }
});

test('registration limit returns 409 and the agreed hint for regular and assistance check-ins', async () => {
  const app = Fastify({ logger: false });
  registerCheckinRoutes(
    app,
    fakeCheckinDb({
      onCreateTicket: () => {
        throw new Error('REGISTRATION_LIMIT_REACHED');
      },
    }),
  );
  try {
    for (const [url, payload] of [
      ['/api/v1/checkins', { topicId: 'mfa', authPath: 'none' }],
      ['/api/v1/checkins/assistance', {}],
    ] as const) {
      const response = await app.inject({ method: 'POST', url, payload });
      assert.equal(response.statusCode, 409);
      assert.equal(response.json().code, 'REGISTRATION_LIMIT_REACHED');
      assert.equal(
        response.json().message,
        'Technisch bedingt sind pro Kennbuchstabe der Themen nur 999 Anmeldungen pro Praxistag möglich.',
      );
    }
  } finally {
    await app.close();
  }
});
