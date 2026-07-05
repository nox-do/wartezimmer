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

async function finishTicketToDone(baseUrl, mfaAuth, visitId, status) {
  if (status === 'waiting') {
    await requestJson(baseUrl, 'POST', `/api/v1/queue/${encodeURIComponent(visitId)}/transition`, {
      auth: mfaAuth,
      jsonBody: { type: 'call' },
      expectedStatus: 200,
    });
    await requestJson(baseUrl, 'POST', `/api/v1/queue/${encodeURIComponent(visitId)}/transition`, {
      auth: mfaAuth,
      jsonBody: { type: 'check_in_room' },
      expectedStatus: 200,
    });
    await requestJson(baseUrl, 'POST', `/api/v1/queue/${encodeURIComponent(visitId)}/transition`, {
      auth: mfaAuth,
      jsonBody: { type: 'check_out_room' },
      expectedStatus: 200,
    });
    return;
  }

  if (status === 'called') {
    await requestJson(baseUrl, 'POST', `/api/v1/queue/${encodeURIComponent(visitId)}/transition`, {
      auth: mfaAuth,
      jsonBody: { type: 'check_in_room' },
      expectedStatus: 200,
    });
    await requestJson(baseUrl, 'POST', `/api/v1/queue/${encodeURIComponent(visitId)}/transition`, {
      auth: mfaAuth,
      jsonBody: { type: 'check_out_room' },
      expectedStatus: 200,
    });
    return;
  }

  if (status === 'in_room') {
    await requestJson(baseUrl, 'POST', `/api/v1/queue/${encodeURIComponent(visitId)}/transition`, {
      auth: mfaAuth,
      jsonBody: { type: 'check_out_room' },
      expectedStatus: 200,
    });
  }
}

async function drainVisibleQueue(baseUrl, mfaAuth) {
  const queue = await requestJson(baseUrl, 'GET', '/api/v1/queue', {
    auth: mfaAuth,
    expectedStatus: 200,
  });
  const items = Array.isArray(queue.body?.items) ? queue.body.items : [];
  for (const item of items) {
    if (typeof item.visitId === 'string' && typeof item.status === 'string') {
      await finishTicketToDone(baseUrl, mfaAuth, item.visitId, item.status);
    }
  }
}

async function main() {
  loadRepoDotEnv();

  const baseUrl = process.env.SMOKE_BASE_URL ?? process.env.APP_BASE_URL ?? 'http://127.0.0.1:8080';
  const mfaAuth = await smokeStaffAuth(baseUrl, 'mfa');
  const terminalAuth = await pairDeviceForSmoke(
    baseUrl,
    'terminal',
    mfaAuth,
    'smoke-day-lifecycle-terminal',
  );

  console.log('0) Sichtbare Resttickets aus Queue auf done bringen (Test-Isolation)');
  await drainVisibleQueue(baseUrl, mfaAuth);

  console.log('1) Lifecycle-Status lesen');
  const lifecycleBefore = await requestJson(baseUrl, 'GET', '/api/v1/ops/day-lifecycle', {
    auth: mfaAuth,
    expectedStatus: 200,
  });
  assert(typeof lifecycleBefore.body?.businessDay === 'string', 'Missing businessDay');
  await ensureCheckinAvailable(baseUrl, mfaAuth);

  console.log('2) Ein aktives Ticket erzeugen');
  const checkin = await requestJson(baseUrl, 'POST', '/api/v1/checkins', {
    auth: terminalAuth,
    jsonBody: {
      topicId: 'offen',
      authPath: 'phone_dob',
    },
    expectedStatus: 201,
  });
  const visitId = checkin.body?.visitId;
  assert(visitId, 'Missing visitId');

  console.log('2b) Day-close/start loescht keine Queue-Daten');
  await requestJson(baseUrl, 'POST', '/api/v1/ops/checkin-lock', {
    auth: mfaAuth,
    jsonBody: { locked: true },
    expectedStatus: 200,
  });
  const dayCloseStarted = await requestJson(baseUrl, 'POST', '/api/v1/ops/day-close/start', {
    auth: mfaAuth,
    expectedStatus: 200,
  });
  assert(
    dayCloseStarted.body?.dayClosePhase === 'started',
    'Expected dayClosePhase=started after day-close/start',
  );
  const queueBeforeReset = await requestJson(baseUrl, 'GET', '/api/v1/queue', {
    auth: mfaAuth,
    expectedStatus: 200,
  });
  assert(
    Array.isArray(queueBeforeReset.body?.items) && queueBeforeReset.body.items.length === 1,
    'Expected ticket to remain after day-close/start',
  );

  console.log('3) Business-Day-Reset wird bewusst trotz aktivem Ticket ausgefuehrt');
  const started = await requestJson(baseUrl, 'POST', '/api/v1/ops/day-lifecycle/reset', {
    auth: mfaAuth,
    jsonBody: { confirmBusinessDayReset: true },
    expectedStatus: 200,
  });
  assert(started.body?.sandboxRestartRequired === true, 'Expected sandboxRestartRequired=true');
  assert(started.body?.sandboxRestartInitiated === true, 'Expected sandboxRestartInitiated=true');
  assert(started.body?.dayClosePhase === 'open', 'Expected dayClosePhase=open');
  assert(typeof started.body?.resetVisitCount === 'number', 'Expected resetVisitCount');

  console.log('4) Alte Ticket-ID ist nach Reset ungueltig');
  const oldTicketCall = await requestJson(
    baseUrl,
    'POST',
    `/api/v1/queue/${encodeURIComponent(visitId)}/transition`,
    {
      auth: mfaAuth,
      jsonBody: { type: 'call' },
      expectedStatus: 404,
    },
  );
  assert(
    oldTicketCall.body?.code === 'TICKET_NOT_FOUND',
    'Expected TICKET_NOT_FOUND for old ticket',
  );

  console.log('5) Outbox ist nach Reset geleert (nur frisches BusinessDayReset)');
  const outbox = await requestJson(baseUrl, 'GET', '/api/v1/ops/outbox-status', {
    auth: mfaAuth,
    expectedStatus: 200,
  });
  assert(outbox.body?.deadLetterCount === 0, 'Expected deadLetterCount=0 after day reset');
  assert(outbox.body?.retryScheduledCount === 0, 'Expected retryScheduledCount=0 after day reset');
  assert(
    (outbox.body?.readyCount ?? 0) <= 1,
    'Expected at most one pending outbox row after day reset',
  );

  console.log('6) Queue ist nach Reset leer');
  const queue = await requestJson(baseUrl, 'GET', '/api/v1/queue', {
    auth: mfaAuth,
    expectedStatus: 200,
  });
  assert(queue.body?.view === 'mfa', 'Expected MFA queue view');
  assert(
    Array.isArray(queue.body?.items) && queue.body.items.length === 0,
    'Expected empty queue after reset',
  );

  console.log('7) Lifecycle-Status nach Reset');
  const lifecycleAfter = await requestJson(baseUrl, 'GET', '/api/v1/ops/day-lifecycle', {
    auth: mfaAuth,
    expectedStatus: 200,
  });
  assert(lifecycleAfter.body?.needsDayStartHint === false, 'Expected needsDayStartHint=false');
  assert(
    lifecycleAfter.body?.lastResetBusinessDay === lifecycleAfter.body?.businessDay,
    'Expected lastResetBusinessDay == businessDay',
  );
  assert(
    lifecycleAfter.body?.checkinLocked === true,
    'Expected checkinLocked=true after day reset',
  );

  console.log('\nSmoke test erfolgreich: Day-Lifecycle Reset-Flow ist konsistent.');
}

main().catch((error) => {
  console.error('\nSmoke test fehlgeschlagen.');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
