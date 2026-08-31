#!/usr/bin/env node

import { loadRepoDotEnv } from './dotenv.mjs';
import {
  assert,
  ensureCheckinAvailable,
  pairDeviceForSmoke,
  requestJson,
  smokeStaffAuth,
} from './smoke-helpers.mjs';

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
      phoneNumber: '+4917612345678',
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

  console.log('4c) zweiter Recall bei laufendem Fenster -> 409');
  await requestJson(baseUrl, 'POST', `/api/v1/queue/${encodeURIComponent(visitId)}/transition`, {
    auth: mfaAuth,
    jsonBody: { type: 'recall' },
    expectedStatus: 409,
  });

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
  await requestJson(baseUrl, 'PUT', `/api/v1/queue/${encodeURIComponent(visitId)}/callback-phone`, {
    auth: mfaAuth,
    jsonBody: { callbackPhone: '4917612345678' },
    expectedStatus: 200,
  });
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
  await requestJson(baseUrl, 'PUT', `/api/v1/queue/${encodeURIComponent(visitId)}/callback-phone`, {
    auth: mfaAuth,
    jsonBody: { callbackPhone: '4917612345678' },
    expectedStatus: 200,
  });

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

  await requestJson(baseUrl, 'POST', `/api/v1/queue/${encodeURIComponent(visitId)}/transition`, {
    auth: mfaAuth,
    jsonBody: { type: 'return_to_waiting' },
    expectedStatus: 200,
  });

  console.log('9) Ticket ohne Telefon: recall ohne smsDispatch');
  const checkinNoPhone = await requestJson(baseUrl, 'POST', '/api/v1/checkins', {
    auth: terminalAuth,
    jsonBody: {
      topicId: 'mfa',
      authPath: 'none',
    },
    expectedStatus: 201,
  });
  const visitNoPhone = checkinNoPhone.body?.visitId;
  assert(typeof visitNoPhone === 'string' && visitNoPhone.length > 0, 'Missing visitId (no phone)');
  await requestJson(baseUrl, 'POST', `/api/v1/queue/${encodeURIComponent(visitNoPhone)}/transition`, {
    auth: mfaAuth,
    jsonBody: { type: 'set_absence', mode: 'wait_here' },
    expectedStatus: 200,
  });
  const recallNoPhone = await requestJson(
    baseUrl,
    'POST',
    `/api/v1/queue/${encodeURIComponent(visitNoPhone)}/transition`,
    {
      auth: mfaAuth,
      jsonBody: { type: 'recall' },
      expectedStatus: 200,
    },
  );
  assert(recallNoPhone.body?.smsDispatch === null, 'Expected smsDispatch=null without phone');

  await requestJson(baseUrl, 'POST', `/api/v1/queue/${encodeURIComponent(visitNoPhone)}/transition`, {
    auth: mfaAuth,
    jsonBody: { type: 'return_to_waiting' },
    expectedStatus: 200,
  });

  console.log('10) Notify-Fehler + retry_recall_notify');
  await requestJson(baseUrl, 'PATCH', '/api/v1/ops/settings', {
    auth: opsAuth,
    jsonBody: { smsProvider: 'seven' },
    expectedStatus: 200,
  });
  await requestJson(baseUrl, 'PATCH', '/api/v1/ops/messaging/providers/seven', {
    auth: mfaAuth,
    jsonBody: { enabled: false },
    expectedStatus: 200,
  });

  const checkinRetry = await requestJson(baseUrl, 'POST', '/api/v1/checkins', {
    auth: terminalAuth,
    jsonBody: {
      topicId: 'offen',
      authPath: 'phone_dob',
      phoneNumber: '+4917612345679',
    },
    expectedStatus: 201,
  });
  const visitRetry = checkinRetry.body?.visitId;
  assert(typeof visitRetry === 'string' && visitRetry.length > 0, 'Missing visitId (retry)');
  await requestJson(baseUrl, 'POST', `/api/v1/queue/${encodeURIComponent(visitRetry)}/transition`, {
    auth: mfaAuth,
    jsonBody: { type: 'set_absence', mode: 'wait_here' },
    expectedStatus: 200,
  });
  const recallFail = await requestJson(
    baseUrl,
    'POST',
    `/api/v1/queue/${encodeURIComponent(visitRetry)}/transition`,
    {
      auth: mfaAuth,
      jsonBody: { type: 'recall' },
      expectedStatus: 200,
    },
  );
  assert(recallFail.body?.smsDispatch?.sent === false, 'Expected failed smsDispatch for retry setup');
  assert(
    typeof recallFail.body?.smsDispatch?.errorCode === 'string',
    'Expected errorCode on failed dispatch',
  );

  await requestJson(baseUrl, 'PATCH', '/api/v1/ops/settings', {
    auth: opsAuth,
    jsonBody: { smsProvider: 'mock' },
    expectedStatus: 200,
  });
  const retryOk = await requestJson(
    baseUrl,
    'POST',
    `/api/v1/queue/${encodeURIComponent(visitRetry)}/transition`,
    {
      auth: mfaAuth,
      jsonBody: { type: 'retry_recall_notify' },
      expectedStatus: 200,
    },
  );
  assert(retryOk.body?.resultType === 'recall_notify_retry', 'Expected recall_notify_retry');
  assert(retryOk.body?.smsDispatch?.sent === true, 'Expected retry smsDispatch sent=true');
  assert(retryOk.body?.recallNotifyErrorCode === null, 'Expected cleared recallNotifyErrorCode');

  console.log('\nSmoke test erfolgreich: SMS/WhatsApp Recall-Feature ist konsistent.');
}

main().catch((error) => {
  console.error('\nSmoke test fehlgeschlagen.');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
