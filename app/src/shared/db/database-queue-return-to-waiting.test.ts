import assert from 'node:assert/strict';
import test from 'node:test';
import { returnToWaitingInDb, type QueueDeps } from './database-queue.js';

type ReturnToWaitingTestDeps = QueueDeps & {
  recallNotifyErrorClears: number;
  recallNotifySentClears: number;
  roomCleared: boolean;
};

function createReturnToWaitingDeps(input: {
  ticketId: string;
  status: 'called' | 'in_room' | 'absent_wait_here' | 'absent_return_later';
  recallNotifyErrorCode?: string | null;
  recallNotifySent?: boolean;
}): ReturnToWaitingTestDeps {
  let recallNotifyErrorClears = 0;
  let recallNotifySentClears = 0;
  let roomCleared = false;

  const queueRow = {
    id: input.ticketId,
    laneCode: 'A',
    number: 1,
    topicId: 'test',
    topicLabel: 'Test',
    destinationRoomId: 'empfang',
    destinationRoomLabel: 'Empfang',
    status: input.status,
    createdAt: '2026-06-16T10:00:00.000Z',
    calledAt: input.status === 'called' || input.status === 'in_room' ? '2026-06-16T10:05:00.000Z' : null,
    identityRef: null,
    checkinPhone: null,
    roomId: input.status === 'called' || input.status === 'in_room' ? 'empfang' : null,
    roomLabel: input.status === 'called' || input.status === 'in_room' ? 'Empfang' : null,
    callbackPhone: null,
    recallNotifyErrorCode: input.recallNotifyErrorCode ?? null,
    recallNotifySent: input.recallNotifySent ?? false,
    returnUntil: input.status.startsWith('absent_') ? '2026-06-16T10:30:00.000Z' : null,
    triageLevel: null,
    documentCount: 0,
  };

  return {
    recallNotifyErrorClears: 0,
    recallNotifySentClears: 0,
    roomCleared: false,
    listQueueStmt: { all: () => [queueRow] },
    getTicketByIdStmt: {
      get: (ticketId: string) =>
        ticketId === input.ticketId
          ? {
              id: input.ticketId,
              status: input.status,
              topicId: 'test',
              destinationRoomId: 'empfang',
              destinationRoomLabel: 'Empfang',
            }
          : undefined,
    },
    getTicketDetailStmt: { get: () => undefined },
    getTicketIdentityViewStmt: { get: () => undefined },
    listExpiredRecallWindowsStmt: { all: () => [] },
    queueSummaryStmt: { get: () => undefined },
    updateTicketCalledStmt: { run: () => undefined },
    updateTicketStatusStmt: {
      run: (status: string) => {
        queueRow.status = status as typeof queueRow.status;
      },
    },
    updateQueueCalledStmt: { run: () => undefined },
    updateQueueReturnUntilStmt: { run: () => undefined },
    updateQueueCallbackPhoneStmt: { run: () => undefined },
    updateQueueRecallNotifyErrorStmt: {
      run: () => {
        recallNotifyErrorClears += 1;
      },
    },
    updateQueueRecallNotifySentStmt: {
      run: () => {
        recallNotifySentClears += 1;
      },
    },
    updateQueueTriageLevelStmt: { run: () => undefined },
    clearQueueRoomStmt: {
      run: () => {
        roomCleared = true;
        queueRow.roomId = null;
        queueRow.roomLabel = null;
      },
    },
    nowIso: () => '2026-06-16T10:10:00.000Z',
    getBusinessDay: () => '2026-06-16',
    getReturnWindowMinutes: () => 15,
    getOpsSettings: () => ({ topics: [], rooms: [] }) as ReturnType<QueueDeps['getOpsSettings']>,
    emitOutboxEvent: () => undefined,
    get recallNotifyErrorClears() {
      return recallNotifyErrorClears;
    },
    get recallNotifySentClears() {
      return recallNotifySentClears;
    },
    get roomCleared() {
      return roomCleared;
    },
  } as ReturnToWaitingTestDeps;
}

test('returnToWaitingInDb accepts absent_wait_here (legacy-only scope)', () => {
  const deps = createReturnToWaitingDeps({
    ticketId: 'absent-1',
    status: 'absent_wait_here',
  });

  const result = returnToWaitingInDb(deps, 'absent-1');

  assert.deepEqual(result, { fromStatus: 'absent_wait_here', toStatus: 'waiting' });
});

test('returnToWaitingInDb accepts absent_return_later (legacy-only scope)', () => {
  const deps = createReturnToWaitingDeps({
    ticketId: 'absent-2',
    status: 'absent_return_later',
  });

  const result = returnToWaitingInDb(deps, 'absent-2');

  assert.deepEqual(result, { fromStatus: 'absent_return_later', toStatus: 'waiting' });
});

test('returnToWaitingInDb clears room for called ticket', () => {
  const deps = createReturnToWaitingDeps({
    ticketId: 'called-1',
    status: 'called',
  });

  returnToWaitingInDb(deps, 'called-1');

  assert.equal(deps.roomCleared, true);
});

test('returnToWaitingInDb does not clear recall notify state', () => {
  const deps = createReturnToWaitingDeps({
    ticketId: 'called-2',
    status: 'called',
    recallNotifyErrorCode: 'SEVEN_NOT_CONFIGURED',
    recallNotifySent: true,
  });

  returnToWaitingInDb(deps, 'called-2');

  assert.equal(deps.recallNotifyErrorClears, 0);
  assert.equal(deps.recallNotifySentClears, 0);
});
