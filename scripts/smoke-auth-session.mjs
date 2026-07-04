#!/usr/bin/env node

import { loadRepoDotEnv } from './dotenv.mjs';
import { assert, loginStaff, requestJson, staffPin } from './smoke-helpers.mjs';

async function main() {
  loadRepoDotEnv();

  const baseUrl = process.env.SMOKE_BASE_URL ?? process.env.APP_BASE_URL ?? 'http://127.0.0.1:8080';
  const role = process.env.SMOKE_AUTH_SESSION_ROLE ?? 'ops';
  const pin = staffPin(role);

  console.log(`1) Staff session login (${role})`);
  const auth = await loginStaff(baseUrl, role, pin);

  const probe =
    role === 'terminal'
      ? { method: 'GET', endpoint: '/api/v1/checkins/topics', expectedStatus: 200 }
      : { method: 'GET', endpoint: '/api/v1/ops/settings', expectedStatus: 200 };

  console.log(`2) Session-authenticated probe ${probe.method} ${probe.endpoint}`);
  const response = await requestJson(baseUrl, probe.method, probe.endpoint, {
    auth,
    expectedStatus: probe.expectedStatus,
  });
  assert(
    response.status === probe.expectedStatus,
    `expected ${probe.expectedStatus}, got ${response.status}`,
  );

  console.log('smoke-auth-session: OK');
}

main().catch((error) => {
  console.error('smoke-auth-session: FAILED');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
