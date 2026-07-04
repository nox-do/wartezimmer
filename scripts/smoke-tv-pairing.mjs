#!/usr/bin/env node

import { loadRepoDotEnv } from './dotenv.mjs';
import { loginStaff, pairDeviceForSmoke, requestJson, staffPin } from './smoke-helpers.mjs';

async function resolveMfaAuth(baseUrl) {
  return loginStaff(baseUrl, 'mfa', staffPin('mfa'));
}

async function main() {
  loadRepoDotEnv();
  const baseUrl = process.env.SMOKE_BASE_URL ?? process.env.APP_BASE_URL ?? 'http://127.0.0.1:8080';

  console.log('1) MFA signs in');
  const mfaAuth = await resolveMfaAuth(baseUrl);

  console.log('2) TV pairs via MFA confirmation');
  const tvAuth = await pairDeviceForSmoke(baseUrl, 'tv', mfaAuth, 'smoke-tv');

  console.log('3) TV cookie can read TV queue snapshot');
  await requestJson(baseUrl, 'GET', '/api/v1/queue', {
    auth: tvAuth,
    expectedStatus: 200,
  });

  console.log('4) TV cookie cannot perform MFA queue mutation');
  await requestJson(baseUrl, 'POST', '/api/v1/queue/__tv_pairing_smoke__/transition', {
    auth: tvAuth,
    jsonBody: { type: 'call' },
    expectedStatus: 403,
  });

  console.log('smoke-tv-pairing: OK');
}

main().catch((error) => {
  console.error('smoke-tv-pairing: FAILED');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
