import assert from 'node:assert/strict';
import test from 'node:test';
import { DomainError } from '../errors/domain-error.js';
import {
  recallTicketInDb,
  retryRecallNotifyInDb,
  setCallbackPhoneInDb,
  clearCallbackPhoneInDb,
  type QueueDeps,
} from './database-queue.js';

function createRecallDeps(ticket: {
  id: string;
  status: 'absent_wait_here';
  callbackPhone?: string | null;
  checkinPhone?: string | null;
}): QueueDeps {
  let returnUntil: string | null = null;

  return {
    getTicketDetailStmt: { get: () => ticket },
    updateTicketStatusStmt: { run: () => undefined },
    updateQueueReturnUntilStmt: {
      run: (value: string) => {
        returnUntil = value;
      },
    },
    listQueueStmt: { all: () => [] },
    listExpiredRecallWindowsStmt: { all: () => [] },
    queueSummaryStmt: { get: () => undefined },
    getTicketByIdStmt: {
      get: () => ({
        id: ticket.id,
        status: ticket.status,
        topicId: 'topic-1',
        destinationRoomId: 'empfang',
        destinationRoomLabel: 'Empfang',
      }),
    },
    updateTicketCalledStmt: { run: () => undefined },
    updateQueueCalledStmt: { run: () => undefined },
    updateQueueCallbackPhoneStmt: { run: () => undefined },
    updateQueueRecallNotifyErrorStmt: { run: () => undefined },
    updateQueueRecallNotifySentStmt: { run: () => undefined },
    clearQueueRoomStmt: { run: () => undefined },
    nowIso: () => '2026-06-14T10:00:00.000Z',
    getBusinessDay: () => '2026-06-14',
    getReturnWindowMinutes: () => 15,
    getOpsSettings: () =>
      ({ topics: [], rooms: [] }) as unknown as ReturnType<QueueDeps['getOpsSettings']>,
    emitOutboxEvent: () => undefined,
    _returnUntil: () => returnUntil,
  } as unknown as QueueDeps & { _returnUntil: () => string | null };
}

test('recallTicketInDb sends notify phone from checkinPhone when callbackPhone missing', () => {
  const deps = createRecallDeps({
    id: 't1',
    status: 'absent_wait_here',
    callbackPhone: null,
    checkinPhone: '0172111111',
  });

  const result = recallTicketInDb(deps, 't1');

  assert.equal(result.callbackPhone, '0172111111');
  assert.equal(result.toStatus, 'absent_return_later');
  assert.equal(result.returnWindowMinutes, 15);
  assert.ok(result.returnUntil);
});

test('recallTicketInDb has no notify phone when neither callback nor checkin stored', () => {
  const deps = createRecallDeps({
    id: 't2',
    status: 'absent_wait_here',
    callbackPhone: null,
    checkinPhone: null,
  });

  const result = recallTicketInDb(deps, 't2');

  assert.equal(result.callbackPhone, null);
  assert.equal(result.toStatus, 'absent_return_later');
});

test('setCallbackPhoneInDb stores trimmed callback phone for waiting ticket', () => {
  let storedPhone: string | null = null;
  const deps = {
    ...createRecallDeps({
      id: 't4',
      status: 'absent_wait_here',
    }),
    getTicketByIdStmt: {
      get: () => ({
        id: 't4',
        status: 'waiting' as const,
        topicId: 'topic-1',
        destinationRoomId: 'empfang',
        destinationRoomLabel: 'Empfang',
      }),
    },
    updateQueueCallbackPhoneStmt: {
      run: (phone: string) => {
        storedPhone = phone;
      },
    },
  } as unknown as QueueDeps;

  const result = setCallbackPhoneInDb(deps, 't4', ' 0172111111 ');

  assert.equal(result.callbackPhone, '+49172111111');
  assert.equal(storedPhone, '+49172111111');
});

test('clearCallbackPhoneInDb removes stored callback phone', () => {
  let storedPhone: string | null = '0172111111';
  const deps = {
    ...createRecallDeps({
      id: 't5',
      status: 'absent_wait_here',
    }),
    getTicketByIdStmt: {
      get: () => ({
        id: 't5',
        status: 'absent_return_later' as const,
        topicId: 'topic-1',
        destinationRoomId: 'empfang',
        destinationRoomLabel: 'Empfang',
      }),
    },
    updateQueueCallbackPhoneStmt: {
      run: (phone: string | null) => {
        storedPhone = phone;
      },
    },
  } as unknown as QueueDeps;

  const result = clearCallbackPhoneInDb(deps, 't5');

  assert.ok(result.updatedAt);
  assert.equal(storedPhone, null);
});

test('retryRecallNotifyInDb rejects when return window expired', () => {
  const deps = {
    ...createRecallDeps({
      id: 't6',
      status: 'absent_wait_here',
    }),
    nowIso: () => '2026-06-14T10:30:00.000Z',
    getTicketDetailStmt: {
      get: () => ({
        id: 't6',
        status: 'absent_return_later' as const,
        callbackPhone: '0172111111',
        checkinPhone: null,
        returnUntil: '2026-06-14T10:20:00.000Z',
        recallNotifyErrorCode: 'SEVEN_NOT_CONFIGURED',
      }),
    },
  } as unknown as QueueDeps;

  assert.throws(
    () => retryRecallNotifyInDb(deps, 't6'),
    (error: unknown) =>
      error instanceof DomainError && error.domainCode === 'RECALL_WINDOW_EXPIRED',
  );
});

test('retryRecallNotifyInDb requires prior recall notify error', () => {
  const deps = {
    ...createRecallDeps({
      id: 't3',
      status: 'absent_wait_here',
      callbackPhone: '0172111111',
      checkinPhone: null,
    }),
    getTicketDetailStmt: {
      get: () => ({
        id: 't3',
        status: 'absent_return_later' as const,
        callbackPhone: '0172111111',
        checkinPhone: null,
        returnUntil: '2026-06-14T10:20:00.000Z',
        recallNotifyErrorCode: null,
      }),
    },
  } as unknown as QueueDeps;

  assert.throws(
    () => retryRecallNotifyInDb(deps, 't3'),
    (error: unknown) =>
      error instanceof DomainError && error.domainCode === 'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
  );
});
