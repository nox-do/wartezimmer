import assert from 'node:assert/strict';
import test from 'node:test';
import { cycleTriageInDb, type QueueDeps } from './database-queue.js';

function createTriageDeps(input: {
  ticketId: string;
  status: 'waiting' | 'called' | 'in_room';
  triageLevel?: string | null;
}): QueueDeps & { triageUpdates: Array<string | null> } {
  const triageUpdates: Array<string | null> = [];
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
    roomId: null,
    roomLabel: null,
    callbackPhone: null,
    recallNotifyErrorCode: null,
    recallNotifySent: false,
    returnUntil: null,
    triageLevel: input.triageLevel ?? null,
    documentCount: 0,
  };

  return {
    triageUpdates,
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
    updateQueueTriageLevelStmt: {
      run: (triageLevel: string | null, ticketId: string) => {
        triageUpdates.push(triageLevel);
        assert.equal(ticketId, input.ticketId);
      },
    },
    nowIso: () => '2026-06-16T10:05:00.000Z',
    getBusinessDay: () => '2026-06-16',
    getReturnWindowMinutes: () => 15,
    getOpsSettings: () => ({ topics: [], rooms: [] }) as ReturnType<QueueDeps['getOpsSettings']>,
    emitOutboxEvent: () => undefined,
  } as unknown as QueueDeps & { triageUpdates: Array<string | null> };
}

test('cycleTriageInDb advances marker from null to green', () => {
  const deps = createTriageDeps({ ticketId: 't1', status: 'waiting', triageLevel: null });

  const result = cycleTriageInDb(deps, 't1');

  assert.deepEqual(result, { triageLevel: 'green', updatedAt: '2026-06-16T10:05:00.000Z' });
  assert.deepEqual(deps.triageUpdates, ['green']);
});

test('cycleTriageInDb advances red to null', () => {
  const deps = createTriageDeps({ ticketId: 't1', status: 'called', triageLevel: 'red' });

  const result = cycleTriageInDb(deps, 't1');

  assert.deepEqual(result, { triageLevel: null, updatedAt: '2026-06-16T10:05:00.000Z' });
  assert.deepEqual(deps.triageUpdates, [null]);
});
