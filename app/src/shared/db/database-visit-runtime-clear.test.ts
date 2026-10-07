import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import {
  ensureVisitEventAuditColumns,
  ensureVisitSupersedeColumns,
} from '@wartezimmer/flow-core/server';
import { CoreDatabase } from './database.js';
import { createCurrentSchema } from './create-current-schema.js';
import { runMigrations } from './migrations-runner.js';
import { ensureVisitHostStateSchema, upsertVisitHostState } from './visit-host-state.js';
import { ensureAuthSettingsSchema } from './database-auth-settings.js';
import { ensureOpsSetupSchema } from './database-ops-setup.js';
import { clearFlowCoreVisitRuntime, flowCoreSchemaSql } from '../flow-core/flow-core-schema.js';
import { getFlowCoreRuntime, syncFlowCoreCatalog } from '../flow-core/flow-core-runtime.js';
import { PF_FLOW_SURFACE_TERMINAL } from '../flow-core/sync-catalog-from-ops-settings.js';
import type { OpsSettings } from './db-types.js';

const VISIT_RUNTIME_TABLES = [
  'visit_events',
  'visit_topics',
  'visits',
  'patients',
  'daily_queue_counters',
  'visit_host_state',
  'patient_sessions',
  'documents',
] as const;

function countTable(db: DatabaseSync, table: string): number {
  const exists = db
    .prepare("SELECT 1 AS exists_flag FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(table) as { exists_flag?: number } | undefined;
  if (exists?.exists_flag !== 1) {
    return 0;
  }
  const row = db.prepare(`SELECT COUNT(1) AS count FROM ${table}`).get() as { count?: number };
  return row.count ?? 0;
}

function assertVisitRuntimeEmpty(db: DatabaseSync): void {
  for (const table of VISIT_RUNTIME_TABLES) {
    assert.equal(countTable(db, table), 0, `${table} should be empty`);
  }
  const violations = db.prepare('PRAGMA foreign_key_check').all();
  assert.equal(violations.length, 0, `foreign_key_check: ${JSON.stringify(violations)}`);
}

function tableReferencesVisits(db: DatabaseSync, table: string): boolean {
  const rows = db.prepare(`PRAGMA foreign_key_list(${table})`).all() as Array<{ table?: string }>;
  return rows.some((row) => row.table === 'visits');
}

function seedVisitPortalRows(db: DatabaseSync, visitId: string): void {
  const now = '2026-09-03T10:00:00.000Z';
  upsertVisitHostState(db, visitId, { checkinPhone: '+49172111111' }, now);
  db.prepare(
    `INSERT INTO patient_sessions (
      id, visit_id, token_hash, status, expires_at, last_seen_at, created_at, updated_at
    ) VALUES (?, ?, ?, 'active', ?, NULL, ?, ?)`,
  ).run('session-1', visitId, 'token-hash-1', now, now, now);
  db.prepare(
    `INSERT INTO documents (
      id, visit_id, session_id, source, file_name, mime_type, size_bytes, status,
      template_id, template_version, created_at, updated_at
    ) VALUES (?, ?, ?, 'upload', 'scan.pdf', 'application/pdf', 12, 'received', NULL, NULL, ?, ?)`,
  ).run('doc-1', visitId, 'session-1', now, now);
}

function openCoreDatabase(): { core: CoreDatabase; inspect: DatabaseSync; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'pf-db-reset-'));
  const dbPath = join(dir, 'wartezimmer.db');
  const previousNodeEnv = process.env.NODE_ENV;
  const previousContactLookupBase = process.env.CONTACT_LOOKUP_BASE_PATH;
  process.env.NODE_ENV = 'test';
  process.env.CONTACT_LOOKUP_BASE_PATH = join(dir, 'imports');
  const core = new CoreDatabase(dbPath);
  const inspect = new DatabaseSync(dbPath);
  inspect.exec('PRAGMA foreign_keys = ON');
  return {
    core,
    inspect,
    cleanup: () => {
      inspect.close();
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
      if (previousContactLookupBase === undefined) {
        delete process.env.CONTACT_LOOKUP_BASE_PATH;
      } else {
        process.env.CONTACT_LOOKUP_BASE_PATH = previousContactLookupBase;
      }
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function seedOpenBusinessDay(core: CoreDatabase): void {
  const state = core.getDayLifecycleState();
  if (state.needsDayStartHint || state.checkinLocked) {
    core.resetBusinessDay();
  }
  if (core.getOpsState().checkinLocked) {
    core.setCheckinLock(false);
  }
}

function seedLiveVisitOnCore(core: CoreDatabase): void {
  seedOpenBusinessDay(core);
  const created = core.createTicket({
    topicId: 'blut',
    authPath: 'phone_dob',
    identityRef: 'Reset Test',
  });
  const ticketCode = core.getTicketCodeByVisitId(created.visitId);
  const session = core.resolvePatientSession(ticketCode);
  core.intakePatientDocument(session.sessionToken, {
    fileName: 'scan.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 24,
    status: 'received',
  });
  core.setCallbackPhone(created.visitId, '0172 1111111');
}

const legacyOpsSettings: OpsSettings = {
  routingMode: 'simple',
  returnWindowMinutes: 15,
  practiceOpenFrom: '00:00',
  practiceOpenTo: '23:59',
  practiceProfileJson: '{}',
  topics: [
    {
      topicId: 'blut',
      label: 'Blutabnahme',
      laneCode: 'L',
      defaultRoomId: 'mfa-tresen',
      iconId: 'droplet',
      accentColor: '#000',
      enabled: true,
      availableFrom: null,
      availableTo: null,
      sortOrder: 1,
    },
  ],
  journeySettings: { templates: [] },
  rooms: [
    {
      roomId: 'mfa-tresen',
      roomLabel: 'Empfang',
      enabled: true,
      defaultCallTarget: true,
      maxOccupancy: null,
      panels: { outside: null, inside: null },
    },
  ],
  contactLookupFolderPath: null,
  contactLookupDelimiterMode: 'auto',
  contactLookupHasHeader: true,
  contactLookupMappingJson: '{}',
  emergencyEnabled: true,
  terminalWlanPromoEnabled: false,
  terminalAuthPhoneEnabled: true,
  terminalAuthNameDobEnabled: false,
  terminalAuthEgkEnabled: false,
  terminalPatientLocales: ['de-DE'],
  smsProvider: 'mock',
  exportBasePath: '/tmp',
  updatedAt: '2026-09-03T10:00:00.000Z',
};

test('resetBusinessDay on generation-1 schema clears visit runtime and host/portal rows', () => {
  const { core, inspect, cleanup } = openCoreDatabase();
  try {
    seedLiveVisitOnCore(core);
    assert.ok(countTable(inspect, 'visits') >= 1);
    assert.ok(countTable(inspect, 'patient_sessions') >= 1);
    assert.ok(countTable(inspect, 'documents') >= 1);
    assert.ok(countTable(inspect, 'visit_host_state') >= 1);

    const topicsBefore = core.getOpsSettings().topics.length;
    core.resetBusinessDay();

    assertVisitRuntimeEmpty(inspect);
    assert.equal(core.getOpsSettings().topics.length, topicsBefore);
    assert.equal(core.listQueue().length, 0);
  } finally {
    cleanup();
  }
});

test('executeRuntimeReset on generation-1 schema clears visit runtime and host/portal rows', () => {
  const { core, inspect, cleanup } = openCoreDatabase();
  try {
    seedLiveVisitOnCore(core);
    const topicsBefore = core.getOpsSettings().topics.length;
    const roomsBefore = core.getOpsSettings().rooms.length;

    core.executeRuntimeReset();

    assertVisitRuntimeEmpty(inspect);
    assert.equal(core.getOpsSettings().topics.length, topicsBefore);
    assert.equal(core.getOpsSettings().rooms.length, roomsBefore);
  } finally {
    cleanup();
  }
});

test('clearFlowCoreVisitRuntime on baseline without visit CASCADE leaves no host/portal orphans', () => {
  process.env.NODE_ENV = 'test';
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  db.exec(flowCoreSchemaSql());
  ensureVisitEventAuditColumns(db);
  ensureVisitSupersedeColumns(db);
  ensureVisitHostStateSchema(db);
  ensureOpsSetupSchema(db);
  ensureAuthSettingsSchema(db);

  assert.equal(tableReferencesVisits(db, 'patient_sessions'), false);
  assert.equal(tableReferencesVisits(db, 'documents'), false);

  syncFlowCoreCatalog(db, legacyOpsSettings);

  const visit = getFlowCoreRuntime(db).checkIn({
    topicId: 'blut',
    authPath: 'phone_dob',
    surfaceId: PF_FLOW_SURFACE_TERMINAL,
  });
  assert.ok(visit);
  seedVisitPortalRows(db, visit.id);
  assert.ok(countTable(db, 'visits') >= 1);
  assert.equal(countTable(db, 'patient_sessions'), 1);
  assert.equal(countTable(db, 'documents'), 1);

  clearFlowCoreVisitRuntime(db);

  assertVisitRuntimeEmpty(db);
  db.close();
});

test('createCurrentSchema still has visit CASCADE after clearFlowCoreVisitRuntime', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  createCurrentSchema(db);
  assert.equal(tableReferencesVisits(db, 'patient_sessions'), true);
  assert.equal(tableReferencesVisits(db, 'documents'), true);
  clearFlowCoreVisitRuntime(db);
  assertVisitRuntimeEmpty(db);
  db.close();
});
