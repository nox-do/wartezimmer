import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { ensureFlowCoreSchema } from '../flow-core/flow-core-schema.js';
import { syncFlowCoreCatalog, getFlowCoreRuntime } from '../flow-core/flow-core-runtime.js';
import { PF_FLOW_SURFACE_TERMINAL } from '../flow-core/sync-catalog-from-ops-settings.js';
import { DEFAULT_TERMINAL_TOPIC_DEFINITIONS } from '../checkin-topic-settings.js';
import type { OpsSettings } from './db-types.js';
import {
  absentModeToQueueDisplayStatus,
  applyVisitRecall,
  clearAbsentMode,
  countVisitQueueSummary,
  ensureVisitHostStateSchema,
  getVisitHostState,
  setVisitAbsentMode,
  setVisitCallbackPhone,
  upsertVisitHostState,
} from './visit-host-state.js';

function sampleSettings(): OpsSettings {
  return {
    returnWindowMinutes: 15,
    practiceOpenFrom: '00:00',
    practiceOpenTo: '23:59',
    practiceProfileJson: '{}',
    topics: DEFAULT_TERMINAL_TOPIC_DEFINITIONS,
    rooms: [
      {
        roomId: 'mfa-tresen',
        roomLabel: 'Empfang',
        enabled: true,
        defaultCallTarget: true,
        maxOccupancy: null,
      },
    ],
    contactLookupFolderPath: null,
    contactLookupDelimiterMode: 'auto',
    contactLookupHasHeader: true,
    contactLookupMappingJson: '{}',
    emergencyEnabled: false,
    terminalWlanPromoEnabled: false,
    terminalAuthPhoneEnabled: true,
    terminalAuthNameDobEnabled: true,
    terminalAuthEgkEnabled: false,
    terminalPatientLocales: [],
    smsProvider: 'vonage',
    exportBasePath: '/tmp',
    updatedAt: '2026-07-05T12:00:00.000Z',
  };
}

function setupDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  ensureFlowCoreSchema(db);
  syncFlowCoreCatalog(db, sampleSettings());
  return db;
}

test('ensureVisitHostStateSchema creates visit_host_state with FK cascade', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  ensureFlowCoreSchema(db);
  ensureVisitHostStateSchema(db);
  syncFlowCoreCatalog(db, sampleSettings());

  const runtime = getFlowCoreRuntime(db);
  const visit = runtime.checkIn({
    topicId: 'blut',
    authPath: 'phone_dob',
    surfaceId: PF_FLOW_SURFACE_TERMINAL,
  });
  assert.ok(visit);

  upsertVisitHostState(
    db,
    visit.id,
    { checkinPhone: '+49172111111', checkinLocale: 'de' },
    '2026-07-05T10:00:00.000Z',
  );

  const row = getVisitHostState(db, visit.id);
  assert.equal(row?.checkinPhone, '+49172111111');
  assert.equal(row?.checkinLocale, 'de');

  db.prepare('DELETE FROM visit_events WHERE visit_id = ?').run(visit.id);
  db.prepare('DELETE FROM visit_topics WHERE visit_id = ?').run(visit.id);
  db.prepare('DELETE FROM visits WHERE id = ?').run(visit.id);
  assert.equal(getVisitHostState(db, visit.id), null);
});

test('absentModeToQueueDisplayStatus maps host overlay to queue pseudo-status', () => {
  assert.equal(absentModeToQueueDisplayStatus('wait_here'), 'absent_wait_here');
  assert.equal(absentModeToQueueDisplayStatus('return_later'), 'absent_return_later');
});

test('applyVisitRecall sets return_later window and clears callback', () => {
  const db = setupDb();
  const runtime = getFlowCoreRuntime(db);
  const visit = runtime.checkIn({
    topicId: 'blut',
    authPath: 'phone_dob',
    surfaceId: PF_FLOW_SURFACE_TERMINAL,
  });
  assert.ok(visit);

  setVisitAbsentMode(db, visit.id, 'wait_here', '2026-07-05T10:00:00.000Z');
  setVisitCallbackPhone(db, visit.id, '0172111111', '2026-07-05T10:01:00.000Z');

  applyVisitRecall(db, visit.id, '2026-07-05T10:15:00.000Z', '2026-07-05T10:02:00.000Z');

  const row = getVisitHostState(db, visit.id);
  assert.equal(row?.absentMode, 'return_later');
  assert.equal(row?.returnUntil, '2026-07-05T10:15:00.000Z');
  assert.equal(row?.callbackPhone, null);
  assert.equal(row?.recallNotifySent, false);
});

test('clearAbsentMode clears overlay but keeps recall notify state', () => {
  const db = setupDb();
  const runtime = getFlowCoreRuntime(db);
  const visit = runtime.checkIn({
    topicId: 'blut',
    authPath: 'phone_dob',
    surfaceId: PF_FLOW_SURFACE_TERMINAL,
  });
  assert.ok(visit);

  upsertVisitHostState(
    db,
    visit.id,
    {
      absentMode: 'return_later',
      returnUntil: '2026-07-05T10:30:00.000Z',
      recallNotifyErrorCode: 'SEVEN_NOT_CONFIGURED',
      recallNotifySent: true,
    },
    '2026-07-05T10:00:00.000Z',
  );

  clearAbsentMode(db, visit.id, '2026-07-05T10:10:00.000Z');

  const row = getVisitHostState(db, visit.id);
  assert.equal(row?.absentMode, null);
  assert.equal(row?.returnUntil, null);
  assert.equal(row?.recallNotifyErrorCode, 'SEVEN_NOT_CONFIGURED');
  assert.equal(row?.recallNotifySent, true);
});

test('countVisitQueueSummary counts absent overlay separately', () => {
  const db = setupDb();
  const runtime = getFlowCoreRuntime(db);
  const settings = sampleSettings();
  const visit = runtime.checkIn({
    topicId: 'blut',
    authPath: 'phone_dob',
    surfaceId: PF_FLOW_SURFACE_TERMINAL,
  });
  assert.ok(visit);

  let summary = countVisitQueueSummary(runtime, db, visit.queueNumberDate);
  assert.equal(summary.waitingNow, 1);
  assert.equal(summary.absentNow, 0);

  setVisitAbsentMode(db, visit.id, 'wait_here', '2026-07-05T10:00:00.000Z');
  summary = countVisitQueueSummary(runtime, db, visit.queueNumberDate);
  assert.equal(summary.waitingNow, 0);
  assert.equal(summary.absentNow, 1);
});
