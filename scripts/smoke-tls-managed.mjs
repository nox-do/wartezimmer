#!/usr/bin/env node
/**
 * Managed TLS setup-route smoke against the local Pebble lab.
 * Stops at applyReady=true. Does not call apply. Never uses TLS_RUNTIME_FAKE.
 *
 *   npm run smoke:tls-managed
 *   npm run smoke:tls-managed -- --keep
 *   npm run smoke:tls-managed -- --cleanup
 */

import { runTlsPebbleSetupSmoke } from './lib/tls-pebble-setup-smoke.mjs';

runTlsPebbleSetupSmoke('managed').catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
