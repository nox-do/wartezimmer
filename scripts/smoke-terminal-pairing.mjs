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

  console.log('2) Terminal pairs via MFA confirmation');
  const terminalAuth = await pairDeviceForSmoke(baseUrl, 'terminal', mfaAuth, 'smoke-terminal');

  console.log('3) Terminal cookie can read terminal topics');
  await requestJson(baseUrl, 'GET', '/api/v1/checkins/topics', {
    auth: terminalAuth,
    expectedStatus: 200,
  });

  console.log('4) Terminal cookie cannot perform MFA queue mutation');
  await requestJson(baseUrl, 'POST', '/api/v1/queue/__terminal_pairing_smoke__/transition', {
    auth: terminalAuth,
    jsonBody: { type: 'call' },
    expectedStatus: 403,
  });

  console.log('smoke-terminal-pairing: OK');
}

main().catch((error) => {
  console.error('smoke-terminal-pairing: FAILED');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
