import assert from 'node:assert/strict';
import test from 'node:test';
import { DomainError } from '../errors/domain-error.js';
import {
  getDayLifecycleStateFromDb,
  resetBusinessDayInDb,
  startDayCloseInDb,
  type DayLifecycleDeps,
} from './database-day-lifecycle.js';
import { setCheckinLockInDb, type CheckinSessionDeps } from './database-checkin-sessions.js';
import { normalizeDayClosePhase } from './database-time.js';

type MutableDayCloseRow = {
  locked?: number;
  phase?: string;
  lastResetBusinessDay?: string;
};

function createDayLifecycleDeps(overrides?: {
  row?: MutableDayCloseRow;
  visitCount?: number;
  businessDay?: string;
}): DayLifecycleDeps & {
  row: MutableDayCloseRow;
  outboxEvents: Array<{ type: string; payload: Record<string, unknown> }>;
  outboxDeleted: boolean;
} {
  const row: MutableDayCloseRow = {
    locked: 0,
    phase: 'open',
    lastResetBusinessDay: '2026-06-14',
    ...overrides?.row,
  };
  const outboxEvents: Array<{ type: string; payload: Record<string, unknown> }> = [];
  let outboxDeleted = false;

  return {
    row,
    outboxEvents,
    outboxDeleted,
    dayCloseStateStmt: { get: () => row },
    updateCheckinLockStmt: {
      run: (locked: number) => {
        row.locked = locked;
      },
    },
    updateDayClosePhaseStmt: {
      run: (phase: string) => {
        row.phase = phase;
      },
    },
    updateLastResetBusinessDayStmt: {
      run: (businessDay: string) => {
        row.lastResetBusinessDay = businessDay;
      },
    },
    deleteAllOutboxEventsStmt: {
      run: () => {
        outboxDeleted = true;
      },
    },
    clearEmergencyStateStmt: { run: () => undefined },
    emergencyStateStmt: { get: () => ({ active: 0 }) },
    countAllVisitsStmt: { get: () => ({ count: overrides?.visitCount ?? 3 }) },
    countVisitsByBusinessDayStmt: { get: () => ({ count: 0 }) },
    maxWaitMsByBusinessDayStmt: { get: () => ({ maxWaitMs: 0 }) },
    topicCountsByBusinessDayStmt: { all: () => [] },
    listOpenVisitsByBusinessDayStmt: { all: () => [] },
    nowIso: () => '2026-06-15T06:00:00.000Z',
    getBusinessDay: () => overrides?.businessDay ?? '2026-06-15',
    normalizeDayClosePhase,
    emitOutboxEvent: (eventType, _aggregateId, payload) => {
      outboxEvents.push({ type: eventType, payload });
    },
    get outboxDeleted() {
      return outboxDeleted;
    },
    set outboxDeleted(value: boolean) {
      outboxDeleted = value;
    },
  } as unknown as DayLifecycleDeps & {
    row: MutableDayCloseRow;
    outboxEvents: Array<{ type: string; payload: Record<string, unknown> }>;
    outboxDeleted: boolean;
  };
}

test('resetBusinessDayInDb clears outbox and emits BusinessDayReset with visit count', () => {
  const deps = createDayLifecycleDeps({ visitCount: 2 });

  const result = resetBusinessDayInDb(deps);

  assert.equal(deps.outboxDeleted, true);
  assert.equal(result.dayClosePhase, 'open');
  assert.equal(result.resetVisitCount, 2);
  assert.equal(result.lastResetBusinessDay, '2026-06-15');
  assert.equal(deps.row.locked, 1);
  assert.equal(deps.row.phase, 'open');
  assert.equal(deps.row.lastResetBusinessDay, '2026-06-15');
  assert.equal(deps.outboxEvents.length, 1);
  assert.equal(deps.outboxEvents[0]?.type, 'BusinessDayReset');
  assert.equal(deps.outboxEvents[0]?.payload.resetVisitCount, 2);
});

test('startDayCloseInDb sets phase without clearing outbox', () => {
  const deps = createDayLifecycleDeps({ row: { locked: 1, phase: 'open' } });

  const result = startDayCloseInDb(deps);

  assert.equal(result.dayClosePhase, 'started');
  assert.equal(deps.row.phase, 'started');
  assert.equal(deps.outboxDeleted, false);
  assert.equal(deps.outboxEvents.length, 1);
  assert.equal(deps.outboxEvents[0]?.type, 'DayCloseStarted');
});

test('startDayCloseInDb requires check-in lock', () => {
  const deps = createDayLifecycleDeps({ row: { locked: 0, phase: 'open' } });

  assert.throws(
    () => startDayCloseInDb(deps),
    (error: unknown) =>
      error instanceof DomainError && error.domainCode === 'CHECKIN_LOCK_REQUIRED',
  );
});

test('getDayLifecycleStateFromDb reads normalized day close phase', () => {
  const deps = createDayLifecycleDeps({
    row: { phase: 'started', locked: 0, lastResetBusinessDay: '2026-06-15' },
  });

  const state = getDayLifecycleStateFromDb(deps);

  assert.equal(state.dayClosePhase, 'started');
});

test('getDayLifecycleStateFromDb rejects invalid day close phase', () => {
  const deps = createDayLifecycleDeps({
    row: { phase: 'closed', locked: 0, lastResetBusinessDay: '2026-06-15' },
  });

  assert.throws(
    () => getDayLifecycleStateFromDb(deps),
    (error: unknown) =>
      error instanceof DomainError && error.domainCode === 'INVALID_DAY_CLOSE_PHASE_VALUE',
  );
});

test('setCheckinLockInDb unlocks without a terminal reachability dependency', () => {
  const deps = createDayLifecycleDeps({
    row: { locked: 1, phase: 'open', lastResetBusinessDay: '2026-06-15' },
    businessDay: '2026-06-15',
  });

  const result = setCheckinLockInDb(deps as unknown as CheckinSessionDeps, false);

  assert.equal(result.checkinLocked, false);
  assert.equal(deps.row.locked, 0);
});

test('setCheckinLockInDb keeps unlock blocked before business day reset', () => {
  const deps = createDayLifecycleDeps({
    row: { locked: 1, phase: 'open', lastResetBusinessDay: '2026-06-14' },
    businessDay: '2026-06-15',
  });

  assert.throws(
    () => setCheckinLockInDb(deps as unknown as CheckinSessionDeps, false),
    (error: unknown) => error instanceof DomainError && error.domainCode === 'CHECKIN_LOCKED',
  );
  assert.equal(deps.row.locked, 1);
});
