import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { afterEach } from 'node:test';
import {
  hasTerminalAssistPendingExpiryForTests,
  resetTerminalAssistPendingExpirySchedulerForTests,
  scheduleTerminalAssistPendingExpiry,
} from '../checkin/terminal-assist-pending-expiry-scheduler.js';
import { TERMINAL_DEVICE_ID } from '../ops/device-ids.js';
import {
  hasRecallWindowExpiryForTests,
  resetRecallWindowExpirySchedulerForTests,
} from '../queue/recall-window-expiry-scheduler.js';
import { CoreDatabase } from './database.js';

afterEach(() => {
  resetRecallWindowExpirySchedulerForTests();
  resetTerminalAssistPendingExpirySchedulerForTests();
});

function openCoreDatabase(): { core: CoreDatabase; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'pf-db-timer-'));
  const dbPath = join(dir, 'praxis-flow.db');
  const previousNodeEnv = process.env.NODE_ENV;
  const previousContactLookupBase = process.env.CONTACT_LOOKUP_BASE_PATH;
  process.env.NODE_ENV = 'test';
  process.env.CONTACT_LOOKUP_BASE_PATH = join(dir, 'imports');
  const core = new CoreDatabase(dbPath);
  return {
    core,
    cleanup: () => {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
      if (previousContactLookupBase === undefined) {
        delete process.env.CONTACT_LOOKUP_BASE_PATH;
      } else {
        process.env.CONTACT_LOOKUP_BASE_PATH = previousContactLookupBase;
      }
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function seedOpenBusinessDay(core: CoreDatabase): void {
  const state = core.getDayLifecycleState();
  if (state.needsDayStartHint || state.checkinLocked) {
    core.resetBusinessDay();
  }
  if (core.getOpsState().checkinLocked) {
    core.setCheckinLock(false);
  }
}

function patchEmitOutboxToThrow(core: CoreDatabase): void {
  const target = core as unknown as {
    emitOutboxEvent: (...args: unknown[]) => void;
  };
  target.emitOutboxEvent = () => {
    throw new Error('simulated outbox failure');
  };
}

function patchWithTransactionToThrowAfterFn(
  core: CoreDatabase,
  message: string,
): void {
  const original = core.withTransaction.bind(core);
  core.withTransaction = ((operationName, fn) =>
    original(operationName, () => {
      fn();
      throw new Error(message);
    })) as typeof core.withTransaction;
}

function seedRecallTimer(core: CoreDatabase): string {
  const created = core.createTicket({
    topicId: 'blut',
    authPath: 'phone_dob',
    identityRef: 'Recall Timer',
  });
  core.setAbsence(created.visitId, 'wait_here');
  core.recallVisit(created.visitId, 15);
  assert.equal(hasRecallWindowExpiryForTests(created.visitId), true);
  return created.visitId;
}

test('returnToWaiting leaves recall timer when TX rolls back', () => {
  const { core, cleanup } = openCoreDatabase();
  try {
    seedOpenBusinessDay(core);
    const created = core.createTicket({
      topicId: 'blut',
      authPath: 'phone_dob',
      identityRef: 'Timer Rollback',
    });
    core.setAbsence(created.visitId, 'wait_here');
    core.recallVisit(created.visitId, 15);
    assert.equal(hasRecallWindowExpiryForTests(created.visitId), true);

    patchEmitOutboxToThrow(core);
    assert.throws(() => core.returnToWaiting(created.visitId));

    assert.equal(hasRecallWindowExpiryForTests(created.visitId), true);
    assert.equal(
      core.listQueue().find((row) => row.id === created.visitId)?.status,
      'absent_return_later',
    );
  } finally {
    cleanup();
  }
});

test('returnToWaiting cancels recall timer only after successful TX', () => {
  const { core, cleanup } = openCoreDatabase();
  try {
    seedOpenBusinessDay(core);
    const created = core.createTicket({
      topicId: 'blut',
      authPath: 'phone_dob',
      identityRef: 'Timer Commit',
    });
    core.setAbsence(created.visitId, 'wait_here');
    core.recallVisit(created.visitId, 15);
    assert.equal(hasRecallWindowExpiryForTests(created.visitId), true);

    core.returnToWaiting(created.visitId);
    assert.equal(hasRecallWindowExpiryForTests(created.visitId), false);
  } finally {
    cleanup();
  }
});

test('pressTerminalAssist does not schedule timer when TX fails after write', () => {
  const { core, cleanup } = openCoreDatabase();
  try {
    seedOpenBusinessDay(core);
    patchWithTransactionToThrowAfterFn(core, 'simulated assist press failure');

    assert.throws(() => core.pressTerminalAssist(TERMINAL_DEVICE_ID));
    assert.equal(hasTerminalAssistPendingExpiryForTests(TERMINAL_DEVICE_ID), false);
    assert.equal(core.getTerminalAssistPending(TERMINAL_DEVICE_ID), null);
  } finally {
    cleanup();
  }
});

test('pressTerminalAssist schedules timer only after successful TX', () => {
  const { core, cleanup } = openCoreDatabase();
  try {
    seedOpenBusinessDay(core);
    core.pressTerminalAssist(TERMINAL_DEVICE_ID);
    assert.equal(hasTerminalAssistPendingExpiryForTests(TERMINAL_DEVICE_ID), true);
  } finally {
    cleanup();
  }
});

test('releaseTerminalAssist leaves assist timer when TX rolls back', () => {
  const { core, cleanup } = openCoreDatabase();
  try {
    seedOpenBusinessDay(core);
    core.pressTerminalAssist(TERMINAL_DEVICE_ID);
    assert.equal(hasTerminalAssistPendingExpiryForTests(TERMINAL_DEVICE_ID), true);

    patchWithTransactionToThrowAfterFn(core, 'simulated assist clear failure');

    assert.throws(() => core.releaseTerminalAssist(TERMINAL_DEVICE_ID));
    assert.equal(hasTerminalAssistPendingExpiryForTests(TERMINAL_DEVICE_ID), true);
    assert.ok(core.getTerminalAssistPending(TERMINAL_DEVICE_ID));
  } finally {
    cleanup();
  }
});

test('clearAllTerminalAssistPending leaves timers when TX rolls back', () => {
  const { core, cleanup } = openCoreDatabase();
  try {
    seedOpenBusinessDay(core);
    core.pressTerminalAssist(TERMINAL_DEVICE_ID);
    scheduleTerminalAssistPendingExpiry(
      core,
      'other-device',
      Date.now() + 60_000,
    );
    assert.equal(hasTerminalAssistPendingExpiryForTests(TERMINAL_DEVICE_ID), true);
    assert.equal(hasTerminalAssistPendingExpiryForTests('other-device'), true);

    patchWithTransactionToThrowAfterFn(core, 'simulated clear-all failure');

    assert.throws(() => core.clearAllTerminalAssistPending());
    assert.equal(hasTerminalAssistPendingExpiryForTests(TERMINAL_DEVICE_ID), true);
    assert.equal(hasTerminalAssistPendingExpiryForTests('other-device'), true);
    assert.ok(core.getTerminalAssistPending(TERMINAL_DEVICE_ID));
  } finally {
    cleanup();
  }
});

test('resetBusinessDay leaves assist and recall timers when TX rolls back', () => {
  const { core, cleanup } = openCoreDatabase();
  try {
    seedOpenBusinessDay(core);
    const visitId = seedRecallTimer(core);
    core.pressTerminalAssist(TERMINAL_DEVICE_ID);
    assert.equal(hasTerminalAssistPendingExpiryForTests(TERMINAL_DEVICE_ID), true);

    patchWithTransactionToThrowAfterFn(core, 'simulated reset failure');

    assert.throws(() => core.resetBusinessDay());
    assert.equal(hasTerminalAssistPendingExpiryForTests(TERMINAL_DEVICE_ID), true);
    assert.equal(hasRecallWindowExpiryForTests(visitId), true);
  } finally {
    cleanup();
  }
});

test('resetBusinessDay clears assist and recall timers only after successful TX', () => {
  const { core, cleanup } = openCoreDatabase();
  try {
    seedOpenBusinessDay(core);
    const visitId = seedRecallTimer(core);
    core.pressTerminalAssist(TERMINAL_DEVICE_ID);

    core.resetBusinessDay();

    assert.equal(hasTerminalAssistPendingExpiryForTests(TERMINAL_DEVICE_ID), false);
    assert.equal(hasRecallWindowExpiryForTests(visitId), false);
  } finally {
    cleanup();
  }
});

test('executeRuntimeReset leaves assist and recall timers when TX rolls back', () => {
  const { core, cleanup } = openCoreDatabase();
  try {
    seedOpenBusinessDay(core);
    const visitId = seedRecallTimer(core);
    core.pressTerminalAssist(TERMINAL_DEVICE_ID);
    assert.equal(hasTerminalAssistPendingExpiryForTests(TERMINAL_DEVICE_ID), true);

    patchWithTransactionToThrowAfterFn(core, 'simulated runtime reset failure');

    assert.throws(() => core.executeRuntimeReset());
    assert.equal(hasTerminalAssistPendingExpiryForTests(TERMINAL_DEVICE_ID), true);
    assert.equal(hasRecallWindowExpiryForTests(visitId), true);
  } finally {
    cleanup();
  }
});

test('executeRuntimeReset clears assist and recall timers only after successful TX', () => {
  const { core, cleanup } = openCoreDatabase();
  try {
    seedOpenBusinessDay(core);
    const visitId = seedRecallTimer(core);
    core.pressTerminalAssist(TERMINAL_DEVICE_ID);

    core.executeRuntimeReset();

    assert.equal(hasTerminalAssistPendingExpiryForTests(TERMINAL_DEVICE_ID), false);
    assert.equal(hasRecallWindowExpiryForTests(visitId), false);
  } finally {
    cleanup();
  }
});
