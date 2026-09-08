import assert from 'node:assert/strict';
import test from 'node:test';
import { mfaQueueSnapshotStatus } from './mfa-queue-snapshot.js';

test('MFA keeps an escorted room transfer in the active room view', () => {
  assert.equal(
    mfaQueueSnapshotStatus({ status: 'waiting', escortTransferPending: true }),
    'in_room',
  );
  assert.equal(
    mfaQueueSnapshotStatus({ status: 'waiting', escortTransferPending: false }),
    'waiting',
  );
});
