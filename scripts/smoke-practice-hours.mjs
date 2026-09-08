#!/usr/bin/env node

import { loadRepoDotEnv } from './dotenv.mjs';
import {
  assert,
  ensureCheckinAvailable,
  pairDeviceForSmoke,
  requestJson,
  smokeStaffAuth,
} from './smoke-helpers.mjs';

function pickPracticeRollback(settings) {
  return {
    practiceOpenFrom: settings.practiceOpenFrom,
    practiceOpenTo: settings.practiceOpenTo,
    topics: settings.topics,
  };
}

async function main() {
  loadRepoDotEnv();

  const baseUrl = process.env.SMOKE_BASE_URL ?? process.env.APP_BASE_URL ?? 'http://127.0.0.1:8080';
  const mfaAuth = await smokeStaffAuth(baseUrl, 'mfa');
  const terminalAuth = await pairDeviceForSmoke(
    baseUrl,
    'terminal',
    mfaAuth,
    'smoke-practice-hours-terminal',
  );

  console.log('0) Aktuelle Ops-Settings lesen');
  const settingsBefore = await requestJson(baseUrl, 'GET', '/api/v1/ops/settings', {
    auth: mfaAuth,
    expectedStatus: 200,
  });
  const rollbackPatch = pickPracticeRollback(settingsBefore.body ?? {});

  await ensureCheckinAvailable(baseUrl, mfaAuth);

  try {
    console.log('1) Praxis immer offen, Thema "offen" deaktivieren');
    const settingsForTopics = await requestJson(baseUrl, 'GET', '/api/v1/ops/settings', {
      auth: mfaAuth,
      expectedStatus: 200,
    });
    const topicsDisabledOffen = (settingsForTopics.body?.topics ?? []).map((topic) =>
      topic.topicId === 'offen' ? { ...topic, enabled: false } : topic,
    );

    await requestJson(baseUrl, 'PATCH', '/api/v1/ops/settings', {
      auth: mfaAuth,
      jsonBody: {
        practiceOpenFrom: '00:00',
        practiceOpenTo: '23:59',
        topics: topicsDisabledOffen,
      },
      expectedStatus: 200,
    });

    console.log('2) Topic "offen" wird mit TOPIC_DISABLED abgewiesen');
    const openBlocked = await requestJson(baseUrl, 'POST', '/api/v1/checkins', {
      auth: terminalAuth,
      jsonBody: { topicId: 'offen', authPath: 'phone_dob' },
      expectedStatus: 409,
    });
    assert(
      openBlocked.body?.code === 'TOPIC_DISABLED',
      'Expected TOPIC_DISABLED when offen topic is disabled',
    );

    console.log('3) Nicht-offen Topic funktioniert weiterhin');
    await requestJson(baseUrl, 'POST', '/api/v1/checkins', {
      auth: terminalAuth,
      jsonBody: { topicId: 'rezept', authPath: 'phone_dob' },
      expectedStatus: 201,
    });

    console.log('4) Persönliche Hilfe innerhalb Praxiszeiten');
    const assistanceCheckin = await requestJson(baseUrl, 'POST', '/api/v1/checkins/assistance', {
      auth: terminalAuth,
      expectedStatus: 201,
    });
    assert(assistanceCheckin.body?.visitId, 'Expected visitId in assistance response');

    console.log('5) Praxisfenster auf wahrscheinlich geschlossenen Ein-Minuten-Slot setzen');
    await requestJson(baseUrl, 'PATCH', '/api/v1/ops/settings', {
      auth: mfaAuth,
      jsonBody: {
        practiceOpenFrom: '12:34',
        practiceOpenTo: '12:34',
      },
      expectedStatus: 200,
    });

    console.log('6) Normaler Check-in wird mit CHECKIN_CLOSED abgewiesen');
    const closedCheckin = await requestJson(baseUrl, 'POST', '/api/v1/checkins', {
      auth: terminalAuth,
      jsonBody: { topicId: 'rezept', authPath: 'phone_dob' },
      expectedStatus: 409,
    });
    assert(
      closedCheckin.body?.code === 'CHECKIN_CLOSED',
      'Expected CHECKIN_CLOSED for closed practice window',
    );

    console.log('7) Persönliche Hilfe wird ebenfalls mit CHECKIN_CLOSED abgewiesen');
    const closedAssistance = await requestJson(baseUrl, 'POST', '/api/v1/checkins/assistance', {
      auth: terminalAuth,
      expectedStatus: 409,
    });
    assert(
      closedAssistance.body?.code === 'CHECKIN_CLOSED',
      'Expected CHECKIN_CLOSED for assistance check-in outside practice',
    );

    console.log('\nSmoke test erfolgreich: Praxiszeiten-Guardrails sind konsistent.');
  } finally {
    console.log('8) Urspruengliche Praxiszeiten wiederherstellen');
    await requestJson(baseUrl, 'PATCH', '/api/v1/ops/settings', {
      auth: mfaAuth,
      jsonBody: rollbackPatch,
      expectedStatus: 200,
    });
  }
}

main().catch((error) => {
  console.error('\nSmoke test fehlgeschlagen.');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
