import assert from 'node:assert/strict';
import test from 'node:test';
import { reassignRoomInDb, type QueueDeps } from './database-queue.js';

const settings = {
  topics: [],
  rooms: [
    {
      roomId: 'empfang',
      roomLabel: 'Empfang',
      enabled: true,
      defaultCallTarget: true,
      maxOccupancy: null,
    },
    {
      roomId: 'labor',
      roomLabel: 'Labor',
      enabled: true,
      defaultCallTarget: false,
      maxOccupancy: null,
    },
  ],
};

function createReassignDeps(input: {
  ticketId: string;
  status: 'called' | 'in_room';
  roomId: string;
  roomLabel: string;
}): QueueDeps & {
  statusUpdates: Array<{ status: string; ticketId: string }>;
  roomUpdates: Array<{ roomId: string | null; roomLabel: string | null; ticketId: string }>;
} {
  const statusUpdates: Array<{ status: string; ticketId: string }> = [];
  const roomUpdates: Array<{ roomId: string | null; roomLabel: string | null; ticketId: string }> =
    [];

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
    statusUpdates,
    roomUpdates,
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
    updateTicketStatusStmt: {
      run: (status: string, _updatedAt: string, ticketId: string) => {
        statusUpdates.push({ status, ticketId });
      },
    },
    updateQueueCalledStmt: {
      run: (
        _updatedAt: string,
        roomId: string | null,
        roomLabel: string | null,
        ticketId: string,
      ) => {
        roomUpdates.push({ roomId, roomLabel, ticketId });
      },
    },
    updateQueueReturnUntilStmt: { run: () => undefined },
    updateQueueCallbackPhoneStmt: { run: () => undefined },
    clearQueueRoomStmt: { run: () => undefined },
    nowIso: () => '2026-06-16T10:05:00.000Z',
    getBusinessDay: () => '2026-06-16',
    getReturnWindowMinutes: () => 15,
    getOpsSettings: () => settings as ReturnType<QueueDeps['getOpsSettings']>,
    emitOutboxEvent: () => undefined,
  } as unknown as QueueDeps & {
    statusUpdates: Array<{ status: string; ticketId: string }>;
    roomUpdates: Array<{ roomId: string | null; roomLabel: string | null; ticketId: string }>;
  };
}

test('reassignRoomInDb keeps called when moving between rooms', () => {
  const deps = createReassignDeps({
    ticketId: 't-called',
    status: 'called',
    roomId: 'labor',
    roomLabel: 'Labor',
  });

  const result = reassignRoomInDb(deps, 't-called', 'empfang', 'Empfang');

  assert.deepEqual(result, { fromStatus: 'called', toStatus: 'called' });
  assert.equal(deps.statusUpdates.length, 1);
  assert.equal(deps.statusUpdates[0]?.status, 'called');
  assert.deepEqual(deps.roomUpdates[0], {
    roomId: 'empfang',
    roomLabel: 'Empfang',
    ticketId: 't-called',
  });
});

test('reassignRoomInDb resets in_room to called when room changes', () => {
  const deps = createReassignDeps({
    ticketId: 't-in-room',
    status: 'in_room',
    roomId: 'labor',
    roomLabel: 'Labor',
  });

  const result = reassignRoomInDb(deps, 't-in-room', 'empfang', 'Empfang');

  assert.deepEqual(result, { fromStatus: 'in_room', toStatus: 'called' });
  assert.equal(deps.statusUpdates[0]?.status, 'called');
  assert.deepEqual(deps.roomUpdates[0], {
    roomId: 'empfang',
    roomLabel: 'Empfang',
    ticketId: 't-in-room',
  });
});

test('reassignRoomInDb keeps in_room when target room is unchanged', () => {
  const deps = createReassignDeps({
    ticketId: 't-same-room',
    status: 'in_room',
    roomId: 'labor',
    roomLabel: 'Labor',
  });

  const result = reassignRoomInDb(deps, 't-same-room', 'labor', 'Labor');

  assert.deepEqual(result, { fromStatus: 'in_room', toStatus: 'in_room' });
  assert.equal(deps.statusUpdates[0]?.status, 'in_room');
});
