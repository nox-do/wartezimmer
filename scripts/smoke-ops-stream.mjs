#!/usr/bin/env node

import { loadRepoDotEnv } from './dotenv.mjs';
import { smokeStaffAuth } from './smoke-helpers.mjs';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readSseEvents(body, stopWhen, timeoutMs = 5000) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events = [];
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';

    for (const chunk of chunks) {
      if (!chunk.trim() || chunk.startsWith(':')) {
        continue;
      }

      const lines = chunk.split('\n');
      const eventLine = lines.find((line) => line.startsWith('event: '));
      const dataLine = lines.find((line) => line.startsWith('data: '));
      if (!eventLine || !dataLine) {
        continue;
      }

      events.push({
        event: eventLine.slice('event: '.length),
        data: JSON.parse(dataLine.slice('data: '.length)),
      });

      if (stopWhen(events)) {
        await reader.cancel();
        return events;
      }
    }
  }

  await reader.cancel();
  return events;
}

async function main() {
  loadRepoDotEnv();

  const baseUrl = process.env.SMOKE_BASE_URL ?? process.env.APP_BASE_URL ?? 'http://127.0.0.1:8080';
  const mfaAuth = await smokeStaffAuth(baseUrl, 'mfa');

  console.log('1) Ops stream liefert Initial-Snapshots');
  const response = await fetch(`${baseUrl}/api/v1/ops/stream`, {
    headers: {
      accept: 'text/event-stream',
      cookie: mfaAuth.cookieJar.header(),
      'x-client-role': 'mfa',
    },
  });
  assert(response.ok, `GET /ops/stream expected 200 but got ${response.status}`);
  assert(response.body, 'GET /ops/stream missing response body');

  const initialEvents = await readSseEvents(response.body, (events) => {
    const names = new Set(events.map((entry) => entry.event));
    return (
      names.has('emergency') &&
      events.filter((entry) => entry.event === 'device.presence').length >= 2 &&
      events.filter((entry) => entry.event === 'device.pairing').length >= 2
    );
  });
  assert(
    initialEvents.some((entry) => entry.event === 'emergency'),
    'Missing emergency snapshot',
  );
  assert(
    initialEvents.some(
      (entry) => entry.event === 'device.presence' && entry.data.deviceId === 'waiting-room',
    ),
    'Missing waiting-room presence snapshot',
  );
  assert(
    initialEvents.some(
      (entry) => entry.event === 'device.pairing' && entry.data.kind === 'terminal',
    ),
    'Missing terminal pairing snapshot',
  );

  console.log('2) Pairing start pusht device.pairing pending');
  const streamResponse = await fetch(`${baseUrl}/api/v1/ops/stream`, {
    headers: {
      accept: 'text/event-stream',
      cookie: mfaAuth.cookieJar.header(),
      'x-client-role': 'mfa',
    },
  });
  assert(streamResponse.ok, `Second GET /ops/stream expected 200 but got ${streamResponse.status}`);
  assert(streamResponse.body, 'Second GET /ops/stream missing response body');

  const readPromise = readSseEvents(
    streamResponse.body,
    (events) =>
      events.some(
        (entry) =>
          entry.event === 'device.pairing' &&
          entry.data.kind === 'terminal' &&
          entry.data.phase === 'pending' &&
          entry.data.revision > 0,
      ),
    8000,
  );

  const start = await fetch(`${baseUrl}/api/v1/auth/terminal/pairing/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ displayId: 'smoke-ops-stream-terminal' }),
  });
  assert(start.status === 200, `pairing/start expected 200 but got ${start.status}`);

  const pairingEvents = await readPromise;
  assert(
    pairingEvents.some(
      (entry) =>
        entry.event === 'device.pairing' &&
        entry.data.kind === 'terminal' &&
        entry.data.phase === 'pending',
    ),
    'Missing pushed terminal pairing pending event',
  );

  console.log(
    '\nSmoke test erfolgreich: Ops-Stream liefert getrennte emergency/presence/pairing Events.',
  );
}

main().catch((error) => {
  console.error('\nSmoke test fehlgeschlagen.');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
