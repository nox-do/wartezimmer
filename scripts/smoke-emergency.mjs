#!/usr/bin/env node

import { loadRepoDotEnv } from './dotenv.mjs';
import { assert, pairDeviceForSmoke, requestJson, smokeStaffAuth } from './smoke-helpers.mjs';

async function main() {
  loadRepoDotEnv();

  const baseUrl = process.env.SMOKE_BASE_URL ?? process.env.APP_BASE_URL ?? 'http://127.0.0.1:8080';
  const mfaAuth = await smokeStaffAuth(baseUrl, 'mfa');
  const heartbeat = () =>
    requestJson(baseUrl, 'GET', '/api/v1/ops/heartbeat', { auth: mfaAuth, expectedStatus: 200 });
  const { body: before } = await heartbeat();
  assert(before.emergencyActive === false, 'Ein Alarm ist bereits aktiv. Smoke-Test abgebrochen.');
  assert(typeof before.emergencyEnabled === 'boolean', 'Heartbeat ohne emergencyEnabled');

  const terminalAuth = await pairDeviceForSmoke(
    baseUrl,
    'terminal',
    mfaAuth,
    'smoke-emergency-terminal',
  );

  const setEnabled = (emergencyEnabled) =>
    requestJson(baseUrl, 'PATCH', '/api/v1/ops/settings', {
      auth: mfaAuth,
      jsonBody: { emergencyEnabled },
      expectedStatus: 200,
    });

  let pendingId = null;
  async function raise() {
    const response = await requestJson(baseUrl, 'POST', '/api/v1/ops/emergency/raise', {
      auth: terminalAuth,
    });
    if (response.status === 200) {
      const alarm = response.body;
      assert(alarm?.alreadyActive === false, 'API meldet einen bereits aktiven Alarm.');
      assert(
        typeof alarm.emergencyId === 'string' && alarm.emergencyId.length > 0,
        'Missing emergencyId',
      );
      pendingId = alarm.emergencyId;
      assert(
        alarm.status === 'raised' && typeof alarm.raisedAt === 'string',
        'Invalid raise response',
      );
    }
    return response;
  }

  async function acknowledge() {
    const { body } = await requestJson(baseUrl, 'POST', '/api/v1/ops/emergency/ack', {
      auth: mfaAuth,
      jsonBody: { emergencyId: pendingId, uiDisplayed: true },
      expectedStatus: 200,
    });
    assert(
      body?.emergencyId === pendingId && body.status === 'acknowledged',
      'Invalid ack response',
    );
    assert(
      body.uiDisplayed === true && typeof body.acknowledgedAt === 'string',
      'Invalid ack metadata',
    );
    pendingId = null;
  }

  try {
    await setEnabled(true);
    const first = await raise();
    assert(first.status === 200, 'Expected 200 on first raise');
    await requestJson(baseUrl, 'POST', '/api/v1/ops/emergency/ack', {
      auth: mfaAuth,
      jsonBody: { emergencyId: first.body.emergencyId, uiDisplayed: false },
      expectedStatus: 400,
    });
    await acknowledge();

    const second = await raise();
    assert(second.status === 200, 'Expected 200 on second raise');
    assert(second.body.emergencyId !== first.body.emergencyId, 'Expected a new emergencyId');
    await acknowledge();

    await setEnabled(false);
    const blocked = await raise();
    assert(
      blocked.status === 409 && blocked.body?.code === 'EMERGENCY_DISABLED',
      'Expected EMERGENCY_DISABLED',
    );
  } finally {
    try {
      if (pendingId !== null) await acknowledge();
    } finally {
      await setEnabled(before.emergencyEnabled);
    }
  }

  const { body: after } = await heartbeat();
  assert(after.emergencyActive === false, 'Nach dem Smoke-Test ist ein Alarm aktiv.');
  assert(
    after.emergencyEnabled === before.emergencyEnabled,
    'Notfall-Einstellung wurde nicht wiederhergestellt.',
  );
  console.log(
    'Smoke-Test erfolgreich. Notfall-API für Auslösen, Quittieren und Deaktivieren geprüft.',
  );
}

main().catch((error) => {
  console.error('Smoke-Test fehlgeschlagen.');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
