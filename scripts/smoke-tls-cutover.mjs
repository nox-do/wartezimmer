#!/usr/bin/env node
/**
 * HTTPS cutover smoke against the local Pebble lab (AP4).
 * Runs obtain then POST /api/setup/host/tls/apply. Never uses TLS_RUNTIME_FAKE.
 * Isolated runtime (.tmp/tls-cutover); same fixed container_names as other TLS smokes.
 *
 *   npm run smoke:tls-cutover
 *   npm run smoke:tls-cutover -- --keep
 *   npm run smoke:tls-cutover -- --cleanup
 */

import { runTlsPebbleSetupSmoke } from './lib/tls-pebble-setup-smoke.mjs';

runTlsPebbleSetupSmoke('cutover').catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
