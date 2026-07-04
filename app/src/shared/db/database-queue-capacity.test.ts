import assert from 'node:assert/strict';
import test from 'node:test';
import { DomainError } from '../errors/domain-error.js';
import { callTicketInDb, type QueueDeps } from './database-queue.js';
import { ROOM_AT_CAPACITY } from '../ops/room-capacity.js';

const settings = {
  topics: [
    {
      topicId: 'offen',
      label: 'Offen',
      laneCode: 'O',
      defaultRoomId: 'behandlung',
      iconId: null,
      accentColor: '#000000',
      enabled: true,
      availableFrom: null,
      availableTo: null,
      sortOrder: 1,
    },
  ],
  rooms: [
    {
      roomId: 'behandlung',
      roomLabel: 'Behandlung',
      enabled: true,
      defaultCallTarget: true,
      maxOccupancy: 1,
    },
  ],
};

function createQueueDeps(): QueueDeps {
  const queueRows = [
    {
      id: 'occupied',
      laneCode: 'A',
      number: 1,
      topicId: 'offen',
      topicLabel: 'Offen',
      destinationRoomId: 'behandlung',
      destinationRoomLabel: 'Behandlung',
      status: 'called' as const,
      createdAt: '2026-06-14T10:00:00.000Z',
      identityRef: null,
      checkinPhone: null,
      roomId: 'behandlung',
      roomLabel: 'Behandlung',
      callbackPhone: null,
      recallNotifyErrorCode: null,
      recallNotifySent: false,
      returnUntil: null,
      documentCount: 0,
    },
  ];

  return {
    listQueueStmt: { all: () => queueRows },
    getTicketByIdStmt: {
      get: (ticketId: string) =>
        ticketId === 'waiting-next'
          ? {
              id: 'waiting-next',
              status: 'waiting',
              topicId: 'offen',
              destinationRoomId: 'behandlung',
              destinationRoomLabel: 'Behandlung',
            }
          : undefined,
    },
    getTicketDetailStmt: { get: () => undefined },
    listExpiredRecallWindowsStmt: { all: () => [] },
    queueSummaryStmt: { get: () => undefined },
    updateTicketCalledStmt: { run: () => undefined },
    updateQueueCalledStmt: { run: () => undefined },
    updateTicketStatusStmt: { run: () => undefined },
    updateQueueReturnUntilStmt: { run: () => undefined },
    updateQueueCallbackPhoneStmt: { run: () => undefined },
    clearQueueRoomStmt: { run: () => undefined },
    nowIso: () => '2026-06-14T10:05:00.000Z',
    getBusinessDay: () => '2026-06-14',
    getReturnWindowMinutes: () => 15,
    getOpsSettings: () => settings as ReturnType<QueueDeps['getOpsSettings']>,
    emitOutboxEvent: () => undefined,
  } as unknown as QueueDeps;
}

test('callTicketInDb rejects when target room is already at capacity', () => {
  const deps = createQueueDeps();

  assert.throws(
    () => callTicketInDb(deps, 'waiting-next', 'behandlung', 'Behandlung'),
    (error: unknown) => error instanceof DomainError && error.domainCode === ROOM_AT_CAPACITY,
  );
});
