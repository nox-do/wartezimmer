import assert from 'node:assert/strict';
import test from 'node:test';
import { DomainError } from '../errors/domain-error.js';
import { setIdentityRefInDb, type QueueDeps } from './database-queue.js';

function createIdentityRefDeps(ticket: {
  ticketId: string;
  status: 'waiting' | 'called';
  identityRef?: string | null;
}): QueueDeps {
  let storedIdentityRef = ticket.identityRef ?? null;

  return {
    getTicketIdentityViewStmt: {
      get: () => ({
        ticketId: ticket.ticketId,
        status: ticket.status,
        identityRef: storedIdentityRef,
      }),
    },
    updateTicketIdentityRefStmt: {
      run: (value: string) => {
        storedIdentityRef = value;
      },
    },
    listQueueStmt: { all: () => [] },
    listExpiredRecallWindowsStmt: { all: () => [] },
    queueSummaryStmt: { get: () => undefined },
    getTicketByIdStmt: { get: () => undefined },
    getTicketDetailStmt: { get: () => undefined },
    updateTicketCalledStmt: { run: () => undefined },
    updateQueueCalledStmt: { run: () => undefined },
    updateTicketStatusStmt: { run: () => undefined },
    updateQueueReturnUntilStmt: { run: () => undefined },
    updateQueueCallbackPhoneStmt: { run: () => undefined },
    updateQueueRecallNotifyErrorStmt: { run: () => undefined },
    updateQueueRecallNotifySentStmt: { run: () => undefined },
    clearQueueRoomStmt: { run: () => undefined },
    nowIso: () => '2026-06-15T10:00:00.000Z',
    getBusinessDay: () => '2026-06-15',
    getReturnWindowMinutes: () => 15,
    getOpsSettings: () =>
      ({ topics: [], rooms: [] }) as unknown as ReturnType<QueueDeps['getOpsSettings']>,
    emitOutboxEvent: () => undefined,
  } as unknown as QueueDeps;
}

test('setIdentityRefInDb stores trimmed name for waiting ticket without identity', () => {
  const deps = createIdentityRefDeps({ ticketId: 't1', status: 'waiting', identityRef: null });
  const result = setIdentityRefInDb(deps, 't1', '  Max Mustermann ');

  assert.equal(result.identityRef, 'Max Mustermann');
  assert.equal(result.updatedAt, '2026-06-15T10:00:00.000Z');
});

test('setIdentityRefInDb rejects when identity already set', () => {
  const deps = createIdentityRefDeps({
    ticketId: 't1',
    status: 'waiting',
    identityRef: 'CSV Name',
  });

  assert.throws(
    () => setIdentityRefInDb(deps, 't1', 'MFA Name'),
    (error: unknown) => error instanceof DomainError && error.domainCode === 'INVALID_TRANSITION',
  );
});

test('setIdentityRefInDb rejects outside waiting list', () => {
  const deps = createIdentityRefDeps({ ticketId: 't1', status: 'called', identityRef: null });

  assert.throws(
    () => setIdentityRefInDb(deps, 't1', 'Max Mustermann'),
    (error: unknown) => error instanceof DomainError && error.domainCode === 'INVALID_TRANSITION',
  );
});

test('setIdentityRefInDb rejects empty name', () => {
  const deps = createIdentityRefDeps({ ticketId: 't1', status: 'waiting', identityRef: null });

  assert.throws(
    () => setIdentityRefInDb(deps, 't1', '   '),
    (error: unknown) => error instanceof DomainError && error.domainCode === 'INVALID_ARGUMENT',
  );
});
