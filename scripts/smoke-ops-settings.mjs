#!/usr/bin/env node

import path from 'node:path';
import { loadRepoDotEnv } from './dotenv.mjs';
import { assert, requestJson, smokeStaffAuth } from './smoke-helpers.mjs';

function pickOpsSettingsRollback(settings) {
  return {
    contactLookupFolderPath: settings.contactLookupFolderPath,
    contactLookupDelimiterMode: settings.contactLookupDelimiterMode,
    contactLookupHasHeader: settings.contactLookupHasHeader,
    contactLookupMapping: settings.contactLookupMapping,
    smsProvider: settings.smsProvider,
  };
}

async function main() {
  loadRepoDotEnv();

  const baseUrl = process.env.SMOKE_BASE_URL ?? process.env.APP_BASE_URL ?? 'http://127.0.0.1:8080';
  const opsAuth = await smokeStaffAuth(baseUrl, 'ops');
  const mfaAuth = await smokeStaffAuth(baseUrl, 'mfa');

  console.log('0) Ops health (ohne Auth)');
  const health = await requestJson(baseUrl, 'GET', '/api/v1/ops/health', { expectedStatus: 200 });
  assert(health.body?.status === 'ok', 'health status must be ok');

  console.log('1) Ops settings ohne Token → 401');
  await requestJson(baseUrl, 'GET', '/api/v1/ops/settings', { expectedStatus: 401 });

  console.log('2) Ops session: GET settings');
  const settings = await requestJson(baseUrl, 'GET', '/api/v1/ops/settings', {
    auth: opsAuth,
    expectedStatus: 200,
  });
  assert(typeof settings.body?.smsProvider === 'string', 'smsProvider missing');
  assert(settings.body?.contactLookupMapping != null, 'contactLookupMapping missing');
  const rollback = pickOpsSettingsRollback(settings.body);

  console.log('3) MFA darf smsProvider nicht patchen → 403');
  await requestJson(baseUrl, 'PATCH', '/api/v1/ops/settings', {
    auth: mfaAuth,
    jsonBody: { smsProvider: settings.body.smsProvider },
    expectedStatus: 403,
  });

  console.log('4) Ops session: GET deployment/storage');
  const storage = await requestJson(baseUrl, 'GET', '/api/v1/ops/deployment/storage', {
    auth: opsAuth,
    expectedStatus: 200,
  });
  assert(storage.body?.imports?.userFolderLabel, 'imports.userFolderLabel missing');
  assert(storage.body?.exports?.userFolderLabel, 'exports.userFolderLabel missing');
  assert(typeof storage.body?.imports?.ready === 'boolean', 'imports.ready missing');

  console.log('5) Ops session: GET outbox-status');
  const outbox = await requestJson(baseUrl, 'GET', '/api/v1/ops/outbox-status', {
    auth: opsAuth,
    expectedStatus: 200,
  });
  assert(typeof outbox.body?.readyCount === 'number', 'readyCount missing');
  assert(typeof outbox.body?.deadLetterCount === 'number', 'deadLetterCount missing');

  console.log('6) Ops session: GET maintenance/runtime-reset/preview');
  const resetPreview = await requestJson(
    baseUrl,
    'GET',
    '/api/v1/ops/maintenance/runtime-reset/preview',
    {
      auth: opsAuth,
      expectedStatus: 200,
    },
  );
  assert(typeof resetPreview.body?.visitCount === 'number', 'preview visitCount missing');
  assert(typeof resetPreview.body?.confirmPhrase === 'string', 'preview confirmPhrase missing');

  console.log('7) Ops session: GET messaging/providers');
  const messaging = await requestJson(baseUrl, 'GET', '/api/v1/ops/messaging/providers', {
    auth: opsAuth,
    expectedStatus: 200,
  });
  assert(Array.isArray(messaging.body?.channels), 'messaging channels missing');

  const importFolders = storage.body?.imports?.importFolders ?? [];
  const folderPath =
    settings.body?.contactLookupFolderPath ??
    importFolders[0]?.containerPath ??
    storage.body?.imports?.containerPath;
  if (folderPath) {
    console.log(`8) Ops session: POST contact-lookup/preview + validate (${folderPath})`);
    await requestJson(baseUrl, 'POST', '/api/v1/ops/contact-lookup/preview', {
      auth: opsAuth,
      jsonBody: {
        contactLookupFolderPath: folderPath,
        contactLookupDelimiterMode: settings.body.contactLookupDelimiterMode ?? 'semicolon',
        contactLookupHasHeader: settings.body.contactLookupHasHeader ?? true,
        contactLookupMapping: settings.body.contactLookupMapping,
      },
      expectedStatus: 200,
    });
    await requestJson(baseUrl, 'POST', '/api/v1/ops/contact-lookup/validate', {
      auth: opsAuth,
      jsonBody: {
        contactLookupFolderPath: folderPath,
        contactLookupDelimiterMode: settings.body.contactLookupDelimiterMode ?? 'semicolon',
        contactLookupHasHeader: settings.body.contactLookupHasHeader ?? true,
        contactLookupMapping: settings.body.contactLookupMapping,
      },
      expectedStatus: 200,
    });
  } else {
    console.log('8) contact-lookup preview/validate übersprungen (kein Import-Ordner)');
  }

  try {
    console.log('9) Ops session: PATCH settings (smsProvider round-trip)');
    const altProvider = settings.body.smsProvider === 'mock' ? 'seven' : 'mock';
    await requestJson(baseUrl, 'PATCH', '/api/v1/ops/settings', {
      auth: opsAuth,
      jsonBody: { smsProvider: altProvider },
      expectedStatus: 200,
    });
    const restored = await requestJson(baseUrl, 'PATCH', '/api/v1/ops/settings', {
      auth: opsAuth,
      jsonBody: rollback,
      expectedStatus: 200,
    });
    assert(restored.body?.smsProvider === rollback.smsProvider, 'rollback smsProvider mismatch');
  } catch (error) {
    console.log('9) Rollback nach Fehler');
    await requestJson(baseUrl, 'PATCH', '/api/v1/ops/settings', {
      auth: opsAuth,
      jsonBody: rollback,
      expectedStatus: 200,
    });
    throw error;
  }

  console.log('10) Ops session: GET settings/onboarding');
  const onboarding = await requestJson(baseUrl, 'GET', '/api/v1/ops/settings/onboarding', {
    auth: opsAuth,
    expectedStatus: 200,
  });
  assert(Array.isArray(onboarding.body?.checks), 'onboarding checks missing');
  assert(typeof onboarding.body?.requiredChecksOk === 'boolean', 'requiredChecksOk missing');
  assert(onboarding.body?.phase, 'onboarding phase missing');

  console.log('11) Ops session: PATCH settings/onboarding (progress)');
  await requestJson(baseUrl, 'PATCH', '/api/v1/ops/settings/onboarding', {
    auth: opsAuth,
    jsonBody: { setupLastStep: 'storage', portalEnabled: false },
    expectedStatus: 200,
  });

  console.log('11a) Ops session: GET onboarding is lightweight (checksVerified=false)');
  const onboardingLight = await requestJson(baseUrl, 'GET', '/api/v1/ops/settings/onboarding', {
    auth: opsAuth,
    expectedStatus: 200,
  });
  assert(onboardingLight.body?.checksVerified === false, 'expected lightweight onboarding GET');

  console.log('11b) Ops session: POST onboarding/verify runs expensive checks');
  const onboardingVerified = await requestJson(
    baseUrl,
    'POST',
    '/api/v1/ops/settings/onboarding/verify',
    {
      auth: opsAuth,
      expectedStatus: 200,
    },
  );
  assert(onboardingVerified.body?.checksVerified === true, 'expected verified onboarding snapshot');

  if (onboarding.body?.setupCompletedAt) {
    console.log('11c) Ops session: duplicate completeOnboarding → 409 SETUP_ALREADY_COMPLETED');
    const duplicate = await requestJson(baseUrl, 'PATCH', '/api/v1/ops/settings/onboarding', {
      auth: opsAuth,
      jsonBody: { completeOnboarding: true },
      expectedStatus: 409,
    });
    assert(
      duplicate.body?.code === 'SETUP_ALREADY_COMPLETED',
      `expected SETUP_ALREADY_COMPLETED, got ${duplicate.body?.code ?? 'none'}`,
    );
  }

  console.log('12) UI: GET /ops/setup (statisches SPA)');
  const setupUiRes = await fetch(`${baseUrl}/ops/setup`);
  assert(setupUiRes.status === 200, `/ops/setup expected 200, got ${setupUiRes.status}`);

  console.log('13) UI: GET /ops (statisches SPA)');
  const uiRes = await fetch(`${baseUrl}/ops`);
  const uiHtml = await uiRes.text();
  assert(uiRes.status === 200, `/ops expected 200, got ${uiRes.status}`);
  assert(
    uiHtml.includes('sveltekit') || uiHtml.includes('__data') || uiHtml.includes('<!DOCTYPE html'),
    '/ops response does not look like SvelteKit HTML',
  );

  console.log('smoke-ops-settings: OK');
}

main().catch((error) => {
  console.error('smoke-ops-settings: FAILED');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
