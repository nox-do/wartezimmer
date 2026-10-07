import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { TERMINAL_DEVICE_ID, WAITING_ROOM_DEVICE_ID } from '@wartezimmer/domain';
import { createCurrentSchema } from './create-current-schema.js';
import { clearFlowCoreVisitRuntime } from '../flow-core/flow-core-schema.js';
import { executeResetKernel } from './database-reset-kernel.js';
import { prepareOpsDatabaseStatements } from './database-ops-statements.js';
import { prepareOutboxDatabaseStatements } from './database-outbox-statements.js';
import {
  authenticateDeviceAuthorization,
  createDeviceAuthorizationDeps,
  createSlotDeviceAuthorization,
  enrollRoomPanelDeviceAuthorization,
  importActiveDeviceAuthorizations,
  listActiveDeviceAuthorizations,
  replaceSlotDeviceAuthorization,
  revokeAllRoomPanelAuthorizations,
  revokeDeviceAuthorizationById,
  revokeRoomPanelAuthorizationsByPlacement,
  revokeRoomPanelAuthorizationsByRoom,
  toDeviceAuthorizationCopyRow,
  touchDeviceAuthorization,
  DEVICE_AUTHORIZATION_TOUCH_MIN_INTERVAL_MS,
} from './database-device-authorizations.js';

function openSchema() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  createCurrentSchema(db);
  return db;
}

test('createCurrentSchema includes device_authorizations', () => {
  const db = openSchema();
  const row = db
    .prepare(
      "SELECT 1 AS existsFlag FROM sqlite_master WHERE type = 'table' AND name = 'device_authorizations'",
    )
    .get() as { existsFlag?: number } | undefined;
  assert.equal(row?.existsFlag, 1);
  db.close();
});

test('TV slot unique: second active insert fails; replace revokes previous', () => {
  const db = openSchema();
  const deps = createDeviceAuthorizationDeps(db, () => '2026-09-01T10:00:00.000Z');
  createSlotDeviceAuthorization(deps, {
    role: 'tv',
    deviceId: WAITING_ROOM_DEVICE_ID,
    token: 'token-a',
  });
  assert.throws(() =>
    createSlotDeviceAuthorization(deps, {
      role: 'tv',
      deviceId: WAITING_ROOM_DEVICE_ID,
      token: 'token-b',
    }),
  );

  const replaced = replaceSlotDeviceAuthorization(deps, {
    role: 'tv',
    deviceId: WAITING_ROOM_DEVICE_ID,
    token: 'token-b',
  });
  assert.equal(authenticateDeviceAuthorization(deps, 'token-a'), null);
  assert.equal(
    authenticateDeviceAuthorization(deps, 'token-b')?.authorizationId,
    replaced.authorizationId,
  );
  assert.equal(listActiveDeviceAuthorizations(deps).length, 1);
  db.close();
});

test('multiple room panels may share room and placement', () => {
  const db = openSchema();
  const deps = createDeviceAuthorizationDeps(db, () => '2026-09-01T10:00:00.000Z');
  const first = enrollRoomPanelDeviceAuthorization(deps, {
    roomId: 'labor',
    placement: 'outside',
    token: 'panel-1',
  });
  const second = enrollRoomPanelDeviceAuthorization(deps, {
    roomId: 'labor',
    placement: 'outside',
    token: 'panel-2',
  });
  assert.notEqual(first.authorizationId, second.authorizationId);
  assert.equal(listActiveDeviceAuthorizations(deps).length, 2);
  assert.equal(revokeRoomPanelAuthorizationsByPlacement(deps, 'labor', 'outside'), 2);
  assert.equal(listActiveDeviceAuthorizations(deps).length, 0);
  db.close();
});

test('group revoke room and all panels leave TV grants', () => {
  const db = openSchema();
  const deps = createDeviceAuthorizationDeps(db, () => '2026-09-01T10:00:00.000Z');
  createSlotDeviceAuthorization(deps, {
    role: 'tv',
    deviceId: WAITING_ROOM_DEVICE_ID,
    token: 'tv-token',
  });
  enrollRoomPanelDeviceAuthorization(deps, {
    roomId: 'labor',
    placement: 'inside',
    token: 'inside',
  });
  enrollRoomPanelDeviceAuthorization(deps, {
    roomId: 'warte',
    placement: 'outside',
    token: 'warte',
  });
  assert.equal(revokeRoomPanelAuthorizationsByRoom(deps, 'labor'), 1);
  assert.equal(
    listActiveDeviceAuthorizations(deps).some((row) => row.roomId === 'labor'),
    false,
  );
  assert.equal(revokeAllRoomPanelAuthorizations(deps), 1);
  assert.equal(listActiveDeviceAuthorizations(deps).length, 1);
  assert.equal(listActiveDeviceAuthorizations(deps)[0]?.role, 'tv');
  db.close();
});

test('import copies active rows; revoked rows stay behind', () => {
  const source = openSchema();
  const sourceDeps = createDeviceAuthorizationDeps(source, () => '2026-09-01T10:00:00.000Z');
  const active = createSlotDeviceAuthorization(sourceDeps, {
    role: 'terminal',
    deviceId: TERMINAL_DEVICE_ID,
    token: 'keep',
  });
  const dropped = createSlotDeviceAuthorization(sourceDeps, {
    role: 'tv',
    deviceId: WAITING_ROOM_DEVICE_ID,
    token: 'drop',
  });
  revokeDeviceAuthorizationById(sourceDeps, dropped.authorizationId);

  const target = openSchema();
  const targetDeps = createDeviceAuthorizationDeps(target, () => '2026-09-01T11:00:00.000Z');
  const imported = importActiveDeviceAuthorizations(
    targetDeps,
    listActiveDeviceAuthorizations(sourceDeps).map(toDeviceAuthorizationCopyRow),
  );
  assert.equal(imported, 1);
  assert.equal(
    authenticateDeviceAuthorization(targetDeps, 'keep')?.authorizationId,
    active.authorizationId,
  );
  assert.equal(authenticateDeviceAuthorization(targetDeps, 'drop'), null);
  source.close();
  target.close();
});

test('day reset and visit wipe leave device_authorizations', () => {
  const db = openSchema();
  const deps = createDeviceAuthorizationDeps(db, () => '2026-09-01T10:00:00.000Z');
  createSlotDeviceAuthorization(deps, {
    role: 'tv',
    deviceId: WAITING_ROOM_DEVICE_ID,
    token: 'survive',
  });
  const ops = prepareOpsDatabaseStatements(db);
  const outbox = prepareOutboxDatabaseStatements(db);
  executeResetKernel({
    deleteAllOutboxEventsStmt: outbox.deleteAllOutboxEventsStmt,
    clearEmergencyStateStmt: ops.clearEmergencyStateStmt,
    updateCheckinLockStmt: ops.updateCheckinLockStmt,
    updateDayClosePhaseStmt: ops.updateDayClosePhaseStmt,
    updateLastResetBusinessDayStmt: ops.updateLastResetBusinessDayStmt,
    emergencyStateStmt: ops.emergencyStateStmt,
    nowIso: () => '2026-09-01T12:00:00.000Z',
    getBusinessDay: () => '2026-09-01',
  });
  clearFlowCoreVisitRuntime(db);
  assert.equal(authenticateDeviceAuthorization(deps, 'survive')?.role, 'tv');
  db.close();
});

test('touch is throttled within the minimum interval', () => {
  let nowMs = Date.parse('2026-09-01T10:00:00.000Z');
  const db = openSchema();
  const deps = createDeviceAuthorizationDeps(db, () => new Date(nowMs).toISOString());
  const created = createSlotDeviceAuthorization(deps, {
    role: 'tv',
    deviceId: WAITING_ROOM_DEVICE_ID,
    token: 'touch',
  });
  nowMs += DEVICE_AUTHORIZATION_TOUCH_MIN_INTERVAL_MS - 1;
  const skipped = touchDeviceAuthorization(deps, created.authorizationId);
  assert.equal(skipped?.lastSeenAt, created.lastSeenAt);
  nowMs += 2;
  const updated = touchDeviceAuthorization(deps, created.authorizationId);
  assert.ok(updated);
  assert.notEqual(updated.lastSeenAt, created.lastSeenAt);
  db.close();
});
