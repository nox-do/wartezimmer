import assert from 'node:assert/strict';
import test from 'node:test';
import { DomainError } from '../errors/domain-error.js';
import { checkInRoomInDb, checkOutRoomInDb, type QueueDeps } from './database-queue.js';
import { QUEUE_ROOM_MISMATCH } from '../queue/queue-room-scope.js';

const settings = {
  topics: [],
  rooms: [
    {
      roomId: 'labor',
      roomLabel: 'Labor',
      enabled: true,
      defaultCallTarget: true,
      maxOccupancy: null,
    },
    {
      roomId: 'empfang',
      roomLabel: 'Empfang',
      enabled: true,
      defaultCallTarget: false,
      maxOccupancy: null,
    },
  ],
};

function createScopeDeps(input: {
  ticketId: string;
  status: 'called' | 'in_room';
  roomId: string;
  roomLabel: string;
}): QueueDeps {
  const queueRow = {
    id: input.ticketId,
    laneCode: 'N',
    number: 1,
    topicId: 'test',
    topicLabel: 'Test',
    destinationRoomId: 'labor',
    destinationRoomLabel: 'Labor',
    status: input.status,
    createdAt: '2026-06-16T10:00:00.000Z',
    identityRef: null,
    checkinPhone: null,
    roomId: input.roomId,
    roomLabel: input.roomLabel,
    callbackPhone: null,
    recallNotifyErrorCode: null,
    recallNotifySent: false,
    returnUntil: null,
    documentCount: 0,
  };

  return {
    listQueueStmt: { all: () => [queueRow] },
    getTicketByIdStmt: {
      get: (ticketId: string) =>
        ticketId === input.ticketId
          ? {
              id: input.ticketId,
              status: input.status,
              topicId: 'test',
              destinationRoomId: 'labor',
              destinationRoomLabel: 'Labor',
            }
          : undefined,
    },
    getTicketDetailStmt: { get: () => undefined },
    listExpiredRecallWindowsStmt: { all: () => [] },
    queueSummaryStmt: { get: () => undefined },
    updateTicketCalledStmt: { run: () => undefined },
    updateTicketStatusStmt: { run: () => undefined },
    updateQueueCalledStmt: { run: () => undefined },
    updateQueueReturnUntilStmt: { run: () => undefined },
    updateQueueCallbackPhoneStmt: { run: () => undefined },
    clearQueueRoomStmt: { run: () => undefined },
    nowIso: () => '2026-06-16T10:05:00.000Z',
    getBusinessDay: () => '2026-06-16',
    getReturnWindowMinutes: () => 15,
    getOpsSettings: () => settings as ReturnType<QueueDeps['getOpsSettings']>,
    emitOutboxEvent: () => undefined,
  } as unknown as QueueDeps;
}

test('checkInRoomInDb allows MFA check-in without actingRoomId', () => {
  const deps = createScopeDeps({
    ticketId: 't-called',
    status: 'called',
    roomId: 'labor',
    roomLabel: 'Labor',
  });

  const result = checkInRoomInDb(deps, 't-called', 'labor', 'Labor');

  assert.deepEqual(result, { fromStatus: 'called', toStatus: 'in_room' });
});

test('checkInRoomInDb rejects scoped check-in from wrong room', () => {
  const deps = createScopeDeps({
    ticketId: 't-called',
    status: 'called',
    roomId: 'empfang',
    roomLabel: 'Empfang',
  });

  assert.throws(
    () => checkInRoomInDb(deps, 't-called', 'empfang', 'Empfang', 'labor'),
    (error: unknown) => error instanceof DomainError && error.domainCode === QUEUE_ROOM_MISMATCH,
  );
});

test('checkOutRoomInDb allows MFA check-out without actingRoomId', () => {
  const deps = createScopeDeps({
    ticketId: 't-in-room',
    status: 'in_room',
    roomId: 'labor',
    roomLabel: 'Labor',
  });

  const result = checkOutRoomInDb(deps, 't-in-room');

  assert.deepEqual(result, { fromStatus: 'in_room', toStatus: 'done' });
});

test('checkOutRoomInDb rejects scoped check-out from wrong room', () => {
  const deps = createScopeDeps({
    ticketId: 't-in-room',
    status: 'in_room',
    roomId: 'empfang',
    roomLabel: 'Empfang',
  });

  assert.throws(
    () => checkOutRoomInDb(deps, 't-in-room', 'labor'),
    (error: unknown) => error instanceof DomainError && error.domainCode === QUEUE_ROOM_MISMATCH,
  );
});

test('checkOutRoomInDb allows scoped check-out when acting room matches assignment', () => {
  const deps = createScopeDeps({
    ticketId: 't-in-room',
    status: 'in_room',
    roomId: 'labor',
    roomLabel: 'Labor',
  });

  const result = checkOutRoomInDb(deps, 't-in-room', 'labor');

  assert.deepEqual(result, { fromStatus: 'in_room', toStatus: 'done' });
});
