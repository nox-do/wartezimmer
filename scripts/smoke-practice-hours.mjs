#!/usr/bin/env node

import { loadRepoDotEnv } from './dotenv.mjs';
import { ensureCheckinAvailable, pairDeviceForSmoke, smokeStaffAuth } from './smoke-helpers.mjs';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function requestJson(
  baseUrl,
  method,
  endpoint,
  { bearerToken, auth, jsonBody, expectedStatus },
) {
  const headers = {};
  if (jsonBody != null) {
    headers['content-type'] = 'application/json';
  }
  if (bearerToken) {
    headers.authorization = `Bearer ${bearerToken}`;
  }
  const cookieHeader = auth?.cookieJar?.header();
  if (cookieHeader) {
    headers.cookie = cookieHeader;
  }
  if (auth?.origin) {
    headers.origin = auth.origin;
  }

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers,
    body: jsonBody != null ? JSON.stringify(jsonBody) : undefined,
  });

  const text = await response.text();
  let body = null;
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (expectedStatus != null && response.status !== expectedStatus) {
    throw new Error(
      `${method} ${endpoint} expected ${expectedStatus} but got ${response.status}\nResponse: ${JSON.stringify(body)}`,
    );
  }

  return { status: response.status, body };
}

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

    console.log('4) mfa-assist cutover liefert assist press innerhalb Praxiszeiten');
    const assistPress = await requestJson(baseUrl, 'POST', '/api/v1/checkins/mfa-assist', {
      auth: terminalAuth,
      expectedStatus: 201,
    });
    assert(assistPress.body?.pressedAt, 'Expected pressedAt in assist cutover response');
    assert(assistPress.body?.expiresAt, 'Expected expiresAt in assist cutover response');

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

    console.log('7) mfa-assist wird ebenfalls mit CHECKIN_CLOSED abgewiesen');
    const closedMfaAssist = await requestJson(baseUrl, 'POST', '/api/v1/checkins/mfa-assist', {
      auth: terminalAuth,
      expectedStatus: 409,
    });
    assert(
      closedMfaAssist.body?.code === 'CHECKIN_CLOSED',
      'Expected CHECKIN_CLOSED for mfa-assist outside practice',
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
