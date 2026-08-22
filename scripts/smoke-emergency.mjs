#!/usr/bin/env node

import { loadRepoDotEnv } from './dotenv.mjs';
import { assert, pairDeviceForSmoke, requestJson, smokeStaffAuth } from './smoke-helpers.mjs';

function pickEmergencyRollbackPatch(settings) {
  return {
    emergencyEnabled: settings.emergencyEnabled,
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
    'smoke-emergency-terminal',
  );

  console.log('0) Aktuelle Ops-Settings lesen');
  const settingsBefore = await requestJson(baseUrl, 'GET', '/api/v1/ops/settings', {
    auth: mfaAuth,
    expectedStatus: 200,
  });
  const rollbackPatch = pickEmergencyRollbackPatch(settingsBefore.body ?? {});

  try {
    console.log('1) Emergency explizit aktivieren');
    await requestJson(baseUrl, 'PATCH', '/api/v1/ops/settings', {
      auth: mfaAuth,
      jsonBody: { emergencyEnabled: true },
      expectedStatus: 200,
    });

    console.log('2) Emergency raise via Terminal');
    const raised = await requestJson(baseUrl, 'POST', '/api/v1/ops/emergency/raise', {
      auth: terminalAuth,
      expectedStatus: 200,
    });
    assert(
      typeof raised.body?.emergencyId === 'string' && raised.body.emergencyId.length > 0,
      'Missing emergencyId',
    );
    assert(raised.body?.status === 'raised', 'Expected status=raised');
    assert(typeof raised.body?.raisedAt === 'string', 'Expected raisedAt');
    assert(typeof raised.body?.alreadyActive === 'boolean', 'Expected alreadyActive flag');
    const emergencyId = raised.body.emergencyId;

    console.log('3) Emergency ack ohne uiDisplayed muss an Validation scheitern');
    await requestJson(baseUrl, 'POST', '/api/v1/ops/emergency/ack', {
      auth: mfaAuth,
      jsonBody: { emergencyId, uiDisplayed: false },
      expectedStatus: 400,
    });

    console.log('4) Emergency ack mit uiDisplayed=true');
    const acknowledged = await requestJson(baseUrl, 'POST', '/api/v1/ops/emergency/ack', {
      auth: mfaAuth,
      jsonBody: { emergencyId, uiDisplayed: true },
      expectedStatus: 200,
    });
    assert(acknowledged.body?.status === 'acknowledged', 'Expected status=acknowledged');
    assert(acknowledged.body?.uiDisplayed === true, 'Expected uiDisplayed=true in ack response');
    assert(acknowledged.body?.emergencyId === emergencyId, 'ack emergencyId mismatch');
    assert(typeof acknowledged.body?.acknowledgedAt === 'string', 'Expected acknowledgedAt');

    console.log('5) Raise erneut nach ack erzeugt neuen Emergency-Vorgang');
    const raisedAgain = await requestJson(baseUrl, 'POST', '/api/v1/ops/emergency/raise', {
      auth: terminalAuth,
      expectedStatus: 200,
    });
    assert(raisedAgain.body?.status === 'raised', 'Expected status=raised on second raise');
    assert(
      typeof raisedAgain.body?.emergencyId === 'string',
      'Missing emergencyId on second raise',
    );
    assert(
      raisedAgain.body?.emergencyId !== emergencyId,
      'Expected new emergencyId after previous ack',
    );

    console.log('6) Emergency deaktivieren und raise muss blocken');
    await requestJson(baseUrl, 'PATCH', '/api/v1/ops/settings', {
      auth: mfaAuth,
      jsonBody: { emergencyEnabled: false },
      expectedStatus: 200,
    });
    const blocked = await requestJson(baseUrl, 'POST', '/api/v1/ops/emergency/raise', {
      auth: terminalAuth,
      expectedStatus: 409,
    });
    assert(blocked.body?.code === 'EMERGENCY_DISABLED', 'Expected EMERGENCY_DISABLED');

    console.log('\nSmoke test erfolgreich: Emergency raise/ack inkl. UI-Quittung ist konsistent.');
  } finally {
    console.log('7) Urspruenglichen Emergency-Settings-Wert wiederherstellen');
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
