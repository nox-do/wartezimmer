import assert from 'node:assert/strict';
import test from 'node:test';
import { persistRecallNotifyResult } from './recall-notify-persist.js';
import type { CoreDatabase } from '../db/database.js';
import type { MessageDispatchResult } from './sms-sender.js';

function createDbStub(): CoreDatabase & {
  errors: Array<string | null>;
  sentFlags: boolean[];
} {
  const errors: Array<string | null> = [];
  const sentFlags: boolean[] = [];

  return {
    errors,
    sentFlags,
    setRecallNotifyError(_visitId: string, errorCode: string | null) {
      errors.push(errorCode);
    },
    setRecallNotifySent(_visitId: string, sent: boolean) {
      sentFlags.push(sent);
    },
  } as unknown as CoreDatabase & { errors: Array<string | null>; sentFlags: boolean[] };
}

test('persistRecallNotifyResult stores error when provider is not configured', () => {
  const db = createDbStub();
  const dispatch: MessageDispatchResult = {
    provider: 'seven',
    attempted: false,
    sent: false,
    errorCode: 'SEVEN_NOT_CONFIGURED',
  };

  persistRecallNotifyResult(db, 't1', dispatch);

  assert.deepEqual(db.errors, ['SEVEN_NOT_CONFIGURED']);
  assert.deepEqual(db.sentFlags, [false]);
});

test('persistRecallNotifyResult clears error and marks sent on success', () => {
  const db = createDbStub();
  const dispatch: MessageDispatchResult = {
    provider: 'mock',
    attempted: true,
    sent: true,
    messageId: 'mock-1',
  };

  persistRecallNotifyResult(db, 't1', dispatch);

  assert.deepEqual(db.errors, [null]);
  assert.deepEqual(db.sentFlags, [true]);
});
