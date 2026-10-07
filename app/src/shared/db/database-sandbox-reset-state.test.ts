import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { CoreDatabase } from './database.js';
import { DomainError } from '../errors/domain-error.js';

test('sandbox reset pending survives independently and blocks manual unlock until reset commits', () => {
  const previousContactBasePath = process.env.CONTACT_LOOKUP_BASE_PATH;
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'pf-reset-state-'));
  process.env.CONTACT_LOOKUP_BASE_PATH = path.join(tempDir, 'contacts');
  try {
    const firstProcess = new CoreDatabase(path.join(tempDir, 'wartezimmer.db'));
    firstProcess.beginSandboxReset();

    const restartedProcess = new CoreDatabase(path.join(tempDir, 'wartezimmer.db'));
    assert.equal(restartedProcess.isSandboxResetPending(), true);
    assert.equal(restartedProcess.getDayLifecycleState().needsDayStartHint, true);
    assert.throws(
      () => restartedProcess.setCheckinLock(false),
      (error: unknown) =>
        error instanceof DomainError && error.domainCode === 'DAY_CLOSE_IN_PROGRESS',
    );

    restartedProcess.resetBusinessDay();
    assert.equal(restartedProcess.isSandboxResetPending(), false);
    assert.equal(restartedProcess.getOpsState().checkinLocked, true);
    assert.equal(firstProcess.isSandboxResetPending(), false);
  } finally {
    if (previousContactBasePath === undefined) {
      delete process.env.CONTACT_LOOKUP_BASE_PATH;
    } else {
      process.env.CONTACT_LOOKUP_BASE_PATH = previousContactBasePath;
    }
    rmSync(tempDir, { recursive: true, force: true });
  }
});
