import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { DomainError } from '../errors/domain-error.js';
import {
  resetSandboxIntakeGateForTests,
  withSandboxIntakeOperation,
  withSandboxIntakePaused,
  withVisitDocumentWorkPaused,
} from './sandbox-intake-gate.js';

afterEach(() => {
  resetSandboxIntakeGateForTests();
});

test('reset waits for active intake and rejects new intake until it completes', async () => {
  let releaseIntake!: () => void;
  const intakeCanFinish = new Promise<void>((resolve) => {
    releaseIntake = resolve;
  });
  let intakeStarted!: () => void;
  const intakeDidStart = new Promise<void>((resolve) => {
    intakeStarted = resolve;
  });

  const activeIntake = withSandboxIntakeOperation(async () => {
    intakeStarted();
    await intakeCanFinish;
    return 'stored';
  });
  await intakeDidStart;

  let resetRan = false;
  const reset = withSandboxIntakePaused(async () => {
    resetRan = true;
    return 'reset';
  });

  await assert.rejects(
    () => withSandboxIntakeOperation(async () => 'late'),
    (error: unknown) => error instanceof DomainError && error.domainCode === 'CHECKIN_LOCKED',
  );
  assert.equal(resetRan, false);

  releaseIntake();
  assert.equal(await activeIntake, 'stored');
  assert.equal(await reset, 'reset');
  assert.equal(resetRan, true);
  assert.equal(await withSandboxIntakeOperation(async () => 'next-day'), 'next-day');
});

test('persistent reset state keeps intake closed after an uncertain purge failure', async () => {
  let resetPending = true;
  await assert.rejects(
    () =>
      withSandboxIntakePaused(async () => {
        throw new Error('purge failed');
      }),
    /purge failed/,
  );

  await assert.rejects(
    () =>
      withSandboxIntakeOperation(
        async () => 'unsafe',
        () => resetPending,
      ),
    (error: unknown) => error instanceof DomainError && error.domainCode === 'CHECKIN_LOCKED',
  );
  resetPending = false;
  assert.equal(
    await withSandboxIntakeOperation(
      async () => 'retryable',
      () => resetPending,
    ),
    'retryable',
  );
});

test('visit pause drains its own work while other visits and intake remain available', async () => {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const upload = withSandboxIntakeOperation(
    async () => {
      await wait;
    },
    () => false,
    'a',
  );
  let discharged = false;
  const checkout = withVisitDocumentWorkPaused('a', async () => {
    discharged = true;
  });
  await assert.rejects(
    () =>
      withSandboxIntakeOperation(
        async () => {},
        () => false,
        'a',
      ),
    /CHECKIN_LOCKED/,
  );
  assert.equal(
    await withSandboxIntakeOperation(
      async () => 'other',
      () => false,
      'b',
    ),
    'other',
  );
  await withVisitDocumentWorkPaused('b', async () => {});
  assert.equal(discharged, false);
  release();
  await Promise.all([upload, checkout]);
  assert.equal(discharged, true);
});
test('global reset waits for discharge and blocks new visit work', async () => {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const checkout = withVisitDocumentWorkPaused('a', async () => {
    await wait;
  });
  let resetRan = false;
  const reset = withSandboxIntakePaused(async () => {
    resetRan = true;
  });
  assert.equal(resetRan, false);
  await assert.rejects(() => withVisitDocumentWorkPaused('b', async () => {}), /CHECKIN_LOCKED/);
  release();
  await Promise.all([checkout, reset]);
  assert.equal(resetRan, true);
});
