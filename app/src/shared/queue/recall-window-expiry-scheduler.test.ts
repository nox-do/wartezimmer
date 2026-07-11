import assert from 'node:assert/strict';
import test, { afterEach, mock } from 'node:test';
import type { CoreDatabase } from '../db/database.js';
import type { QueueVisitRow } from '../db/db-types.js';
import {
  resetRecallWindowExpirySchedulerForTests,
  scheduleRecallWindowExpiry,
} from './recall-window-expiry-scheduler.js';

afterEach(() => {
  mock.timers.reset();
  resetRecallWindowExpirySchedulerForTests();
});

test('scheduleRecallWindowExpiry moves only the scheduled ticket at returnUntil', () => {
  mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  mock.timers.setTime(Date.parse('2026-06-10T10:00:00.000Z'));

  const processed: string[] = [];
  const db = {
    listQueue: () => [],
    listActiveTerminalAssistPending: () => [],
    getOpsSettings: () => ({ rooms: [] }),
    processExpiredRecallWindows: () => [],
    processExpiredRecallWindowForVisit: (visitId: string) => {
      processed.push(visitId);
      return visitId === 'ticket-1';
    },
    isCheckinLocked: () => false,
    isEffectiveCheckinLocked: () => false,
  } as unknown as CoreDatabase;

  scheduleRecallWindowExpiry(db, 'ticket-1', Date.parse('2026-06-10T10:00:05.000Z'));
  assert.deepEqual(processed, []);

  mock.timers.tick(5_000);
  assert.deepEqual(processed, ['ticket-1']);
});

test('scheduleRecallWindowExpiry reschedules when expiry transition is not yet applied', () => {
  mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  mock.timers.setTime(Date.parse('2026-06-10T10:00:00.000Z'));

  const returnUntil = '2026-06-10T10:00:05.000Z';
  const queueItem: QueueVisitRow = {
    id: 'ticket-1',
    laneCode: 'A',
    number: 1,
    topicId: 'topic-1',
    topicLabel: 'Allgemein',
    destinationRoomId: 'empfang',
    destinationRoomLabel: 'Empfang',
    status: 'absent_return_later',
    createdAt: '2026-06-10T09:00:00.000Z',
    calledAt: null,
    identityRef: null,
    checkinPhone: null,
    roomId: null,
    roomLabel: null,
    journeyStepCompletedAt: null,
    startedAt: null,
    movementMode: null,
    callbackPhone: null,
    recallNotifyErrorCode: null,
    recallNotifySent: false,
    returnUntil,
    triageLevel: null,
    documentCount: 0,
    needsAssistance: false,
  };

  let processCalls = 0;
  const db = {
    listQueue: () => [queueItem],
    getOpsSettings: () => ({ rooms: [] }),
    processExpiredRecallWindows: () => [],
    processExpiredRecallWindowForVisit: () => {
      processCalls += 1;
      return false;
    },
    isCheckinLocked: () => false,
    isEffectiveCheckinLocked: () => false,
  } as unknown as CoreDatabase;

  scheduleRecallWindowExpiry(db, 'ticket-1', Date.parse(returnUntil));
  mock.timers.tick(5_000);
  assert.equal(processCalls, 1);

  mock.timers.tick(1_000);
  assert.equal(processCalls, 2);
});
