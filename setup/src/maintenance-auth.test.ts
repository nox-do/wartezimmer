import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { configureMaintenanceAuthHome, maintenanceRequestHeaders } from './maintenance-auth.js';

test('maintenance headers use the installation env instead of process.env', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-maintenance-auth-'));
  const previous = process.env.MAINTENANCE_TOKEN;
  try {
    fs.writeFileSync(path.join(home, '.env'), `MAINTENANCE_TOKEN=${'i'.repeat(32)}\n`);
    process.env.MAINTENANCE_TOKEN = 'process-token-that-must-not-win-1234';
    configureMaintenanceAuthHome(home);
    assert.equal(maintenanceRequestHeaders().authorization, `Bearer ${'i'.repeat(32)}`);
  } finally {
    if (previous === undefined) delete process.env.MAINTENANCE_TOKEN;
    else process.env.MAINTENANCE_TOKEN = previous;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
