import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { CoreDatabase } from './database.js';
import { OpsSettingsValidationError } from './ops-settings-errors.js';

test('updateOpsSettings checks expected revision inside the write transaction', () => {
  const previousContactBasePath = process.env.CONTACT_LOOKUP_BASE_PATH;
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'pf-settings-revision-'));
  process.env.CONTACT_LOOKUP_BASE_PATH = path.join(tempDir, 'contacts');
  try {
    const db = new CoreDatabase(path.join(tempDir, 'wartezimmer.db'));
    const initial = db.getOpsSettings();
    const first = db.updateOpsSettings(
      { emergencyEnabled: !initial.emergencyEnabled },
      { expectedUpdatedAt: initial.updatedAt },
    );
    assert.notEqual(first.updatedAt, initial.updatedAt);

    assert.throws(
      () =>
        db.updateOpsSettings(
          { terminalWlanPromoEnabled: !initial.terminalWlanPromoEnabled },
          { expectedUpdatedAt: initial.updatedAt },
        ),
      (error: unknown) =>
        error instanceof OpsSettingsValidationError && error.apiCode === 'OPS_SETTINGS_STALE',
    );
  } finally {
    if (previousContactBasePath === undefined) {
      delete process.env.CONTACT_LOOKUP_BASE_PATH;
    } else {
      process.env.CONTACT_LOOKUP_BASE_PATH = previousContactBasePath;
    }
    rmSync(tempDir, { recursive: true, force: true });
  }
});
