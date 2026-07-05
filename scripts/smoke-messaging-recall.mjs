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

async function main() {
  loadRepoDotEnv();

  const baseUrl = process.env.SMOKE_BASE_URL ?? process.env.APP_BASE_URL ?? 'http://127.0.0.1:8080';
  const mfaAuth = await smokeStaffAuth(baseUrl, 'mfa');
  const opsAuth = await smokeStaffAuth(baseUrl, 'ops');
  const terminalAuth = await pairDeviceForSmoke(
    baseUrl,
    'terminal',
    mfaAuth,
    'smoke-messaging-terminal',
  );

  console.log('1) Ops settings auf smsProvider=mock setzen');
  await requestJson(baseUrl, 'PATCH', '/api/v1/ops/settings', {
    auth: opsAuth,
    jsonBody: { smsProvider: 'mock' },
    expectedStatus: 200,
  });

  console.log('2) Messenger-Provider-Katalog laden (seven_whatsapp sichtbar)');
  const providers = await requestJson(baseUrl, 'GET', '/api/v1/ops/messaging/providers', {
    auth: mfaAuth,
    expectedStatus: 200,
  });
  const messengerProviders =
    providers.body?.channels?.find((channel) => channel.id === 'messenger')?.providers ?? [];
  assert(
    messengerProviders.some((provider) => provider.id === 'seven_whatsapp'),
    'Expected seven_whatsapp provider in messenger channel',
  );

  console.log('3) seven_whatsapp konfigurieren und Credential-Merge pruefen');
  await requestJson(baseUrl, 'PATCH', '/api/v1/ops/messaging/providers/seven_whatsapp', {
    auth: mfaAuth,
    jsonBody: {
      enabled: false,
      credentials: {
        apiKey: 'dummy-key',
        from: '4915111111111',
        template: 'hello_world',
      },
    },
    expectedStatus: 200,
  });
  const merged = await requestJson(
    baseUrl,
    'PATCH',
    '/api/v1/ops/messaging/providers/seven_whatsapp',
    {
      auth: mfaAuth,
      jsonBody: {
        credentials: {
          language: 'de',
        },
      },
      expectedStatus: 200,
    },
  );
  assert(
    merged.body?.configured === true,
    'Expected configured=true after partial credential patch',
  );
  assert(merged.body?.enabled === false, 'Expected enabled=false for deterministic recall smoke');

  await ensureCheckinAvailable(baseUrl, mfaAuth);

  console.log('4) Ticket erzeugen');
  const checkin = await requestJson(baseUrl, 'POST', '/api/v1/checkins', {
    auth: terminalAuth,
    jsonBody: {
      topicId: 'offen',
      authPath: 'phone_dob',
      phoneNumber: '017612345678',
    },
    expectedStatus: 201,
  });
  const visitId = checkin.body?.visitId;
  assert(typeof visitId === 'string' && visitId.length > 0, 'Missing visitId');

  console.log('4b) wait_here + recall nutzt checkin_phone fuer SMS');
  await requestJson(baseUrl, 'POST', `/api/v1/queue/${encodeURIComponent(visitId)}/transition`, {
    auth: mfaAuth,
    jsonBody: { type: 'set_absence', mode: 'wait_here' },
    expectedStatus: 200,
  });
  const recallWaitHere = await requestJson(
    baseUrl,
    'POST',
    `/api/v1/queue/${encodeURIComponent(visitId)}/transition`,
    {
      auth: mfaAuth,
      jsonBody: { type: 'recall' },
      expectedStatus: 200,
    },
  );
  assert(
    recallWaitHere.body?.smsDispatch?.provider === 'mock',
    'Expected mock smsDispatch for wait_here recall',
  );
  assert(
    recallWaitHere.body?.smsDispatch?.sent === true,
    'Expected smsDispatch sent=true for wait_here recall',
  );

  await requestJson(baseUrl, 'POST', `/api/v1/queue/${encodeURIComponent(visitId)}/transition`, {
    auth: mfaAuth,
    jsonBody: { type: 'return_to_waiting' },
    expectedStatus: 200,
  });

  console.log('5) wait_here + callback-phone + recall (MFA-Nummer)');
  await requestJson(baseUrl, 'POST', `/api/v1/queue/${encodeURIComponent(visitId)}/transition`, {
    auth: mfaAuth,
    jsonBody: { type: 'set_absence', mode: 'wait_here' },
    expectedStatus: 200,
  });
  await requestJson(
    baseUrl,
    'PUT',
    `/api/v1/queue/${encodeURIComponent(visitId)}/callback-phone`,
    {
      auth: mfaAuth,
      jsonBody: { callbackPhone: '4917612345678' },
      expectedStatus: 200,
    },
  );
  const recallSms = await requestJson(
    baseUrl,
    'POST',
    `/api/v1/queue/${encodeURIComponent(visitId)}/transition`,
    {
      auth: mfaAuth,
      jsonBody: { type: 'recall' },
      expectedStatus: 200,
    },
  );
  assert(recallSms.body?.smsDispatch?.provider === 'mock', 'Expected mock smsDispatch provider');
  assert(recallSms.body?.smsDispatch?.sent === true, 'Expected mock smsDispatch sent=true');

  console.log('6) return-to-waiting (zurueck nach waiting)');
  await requestJson(baseUrl, 'POST', `/api/v1/queue/${encodeURIComponent(visitId)}/transition`, {
    auth: mfaAuth,
    jsonBody: { type: 'return_to_waiting' },
    expectedStatus: 200,
  });

  console.log('7) wait_here + callback-phone erneut fuer WhatsApp-Fallback');
  await requestJson(baseUrl, 'POST', `/api/v1/queue/${encodeURIComponent(visitId)}/transition`, {
    auth: mfaAuth,
    jsonBody: { type: 'set_absence', mode: 'wait_here' },
    expectedStatus: 200,
  });
  await requestJson(
    baseUrl,
    'PUT',
    `/api/v1/queue/${encodeURIComponent(visitId)}/callback-phone`,
    {
      auth: mfaAuth,
      jsonBody: { callbackPhone: '4917612345678' },
      expectedStatus: 200,
    },
  );

  console.log('8) recall notifyChannel=whatsapp -> SMS fallback when WhatsApp disabled');
  const recallWhatsApp = await requestJson(
    baseUrl,
    'POST',
    `/api/v1/queue/${encodeURIComponent(visitId)}/transition`,
    {
      auth: mfaAuth,
      jsonBody: { type: 'recall', notifyChannel: 'whatsapp' },
      expectedStatus: 200,
    },
  );
  assert(
    recallWhatsApp.body?.smsDispatch?.provider === 'mock',
    'Expected mock SMS fallback when WhatsApp is disabled',
  );
  assert(recallWhatsApp.body?.smsDispatch?.sent === true, 'Expected sent=true via SMS fallback');

  console.log('\nSmoke test erfolgreich: SMS/WhatsApp Recall-Feature ist konsistent.');
}

main().catch((error) => {
  console.error('\nSmoke test fehlgeschlagen.');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
