import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { DomainError } from '../errors/domain-error.js';
import {
  DEFAULT_TERMINAL_TOPIC_DEFINITIONS,
  MFA_ASSIST_TOPIC_ID,
} from '../checkin-topic-settings.js';
import type { OpsSettings } from '../db/db-types.js';
import { getBusinessDay } from '../db/database-time.js';
import {
  ensureVisitHostStateSchema,
  getVisitHostState,
  upsertVisitHostState,
} from '../db/visit-host-state.js';
import { ensureFlowCoreSchema } from './flow-core-schema.js';
import { getFlowCoreRuntime, syncFlowCoreCatalog } from './flow-core-runtime.js';
import { PF_FLOW_SURFACE_TERMINAL } from './sync-catalog-from-ops-settings.js';
import { listVisitQueueRows } from './visit-queue-bridge.js';
import { rebindDocumentsForSupersede, supersedeVisitTopic } from './visit-supersede-bridge.js';

function sampleSettings(): OpsSettings {
  return {
    routingMode: 'simple',
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
    updatedAt: '2026-07-10T12:00:00.000Z',
  };
}

function setupHostDb(): { db: DatabaseSync; settings: OpsSettings } {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  ensureFlowCoreSchema(db);
  ensureVisitHostStateSchema(db);
  const settings = sampleSettings();
  syncFlowCoreCatalog(db, settings);
  db.exec(`
    CREATE TABLE IF NOT EXISTS patient_sessions (
      id TEXT PRIMARY KEY,
      visit_id TEXT NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK (status IN ('active', 'expired', 'revoked')),
      expires_at TEXT NOT NULL,
      last_seen_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      visit_id TEXT NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL REFERENCES patient_sessions(id) ON DELETE CASCADE,
      source TEXT NOT NULL CHECK (source IN ('upload', 'form')),
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      template_id TEXT,
      template_version INTEGER,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return { db, settings };
}

test('rebindDocumentsForSupersede: nur bei gültigem Successor-Paar', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE visits (
      id TEXT PRIMARY KEY,
      supersedes_visit_id TEXT,
      superseded_by_visit_id TEXT
    );
    CREATE TABLE documents (
      id TEXT PRIMARY KEY,
      visit_id TEXT NOT NULL,
      updated_at TEXT
    );
  `);
  db.prepare(
    'INSERT INTO visits (id, supersedes_visit_id, superseded_by_visit_id) VALUES (?, ?, ?)',
  ).run('old', null, 'new');
  db.prepare(
    'INSERT INTO visits (id, supersedes_visit_id, superseded_by_visit_id) VALUES (?, ?, ?)',
  ).run('new', 'old', null);
  db.prepare('INSERT INTO documents (id, visit_id, updated_at) VALUES (?, ?, ?)').run(
    'doc1',
    'old',
    '2026-01-01T00:00:00.000Z',
  );

  const changes = rebindDocumentsForSupersede(db, 'old', 'new');
  assert.equal(changes, 1);
  const row = db.prepare('SELECT visit_id AS visitId FROM documents WHERE id = ?').get('doc1') as {
    visitId: string;
  };
  assert.equal(row.visitId, 'new');
});

test('rebindDocumentsForSupersede: falsches Paar abgelehnt', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE visits (
      id TEXT PRIMARY KEY,
      supersedes_visit_id TEXT,
      superseded_by_visit_id TEXT
    );
    CREATE TABLE documents (
      id TEXT PRIMARY KEY,
      visit_id TEXT NOT NULL,
      updated_at TEXT
    );
  `);
  db.prepare(
    'INSERT INTO visits (id, supersedes_visit_id, superseded_by_visit_id) VALUES (?, ?, ?)',
  ).run('old', null, 'new');
  db.prepare(
    'INSERT INTO visits (id, supersedes_visit_id, superseded_by_visit_id) VALUES (?, ?, ?)',
  ).run('new', 'old', null);
  db.prepare('INSERT INTO visits (id) VALUES (?)').run('other');

  assert.throws(
    () => rebindDocumentsForSupersede(db, 'old', 'other'),
    (error: unknown) => error instanceof DomainError && error.domainCode === 'DOCUMENT_FORBIDDEN',
  );
});

test('supersedeVisitTopic: Host-State, Docs, Session-Revoke, Wartezeit-Sort', () => {
  const { db, settings } = setupHostDb();
  const runtime = getFlowCoreRuntime(db);
  const source = runtime.checkIn({
    mfaAssist: true,
    surfaceId: PF_FLOW_SURFACE_TERMINAL,
  });
  assert.ok(source);
  assert.equal(source.primaryTopicId, MFA_ASSIST_TOPIC_ID);
  const preservedCheckedInAt = source.checkedInAt;
  assert.ok(preservedCheckedInAt);

  upsertVisitHostState(
    db,
    source.id,
    {
      checkinPhone: '+49172111111',
      checkinLocale: 'de',
      callbackPhone: '+49172222222',
      identityRefOverride: 'Max Test',
      triageLevel: 'yellow',
    },
    '2026-07-10T10:00:00.000Z',
  );

  const now = '2026-07-10T10:05:00.000Z';
  db.prepare(
    `INSERT INTO patient_sessions (id, visit_id, token_hash, status, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, ?, ?)`,
  ).run('sess1', source.id, 'hash1', '2026-07-10T12:00:00.000Z', now, now);
  db.prepare(
    `INSERT INTO documents (
       id, visit_id, session_id, source, file_name, mime_type, size_bytes, status, created_at, updated_at
     ) VALUES (?, ?, ?, 'upload', 'scan.pdf', 'application/pdf', 12, 'received', ?, ?)`,
  ).run('doc1', source.id, 'sess1', now, now);

  const result = supersedeVisitTopic({
    db,
    runtime,
    settings,
    visitId: source.id,
    topicId: 'blut',
  });

  assert.equal(result.supersededVisitId, source.id);
  assert.notEqual(result.visitId, source.id);
  assert.equal(result.topicId, 'blut');
  assert.equal(result.checkedInAt, preservedCheckedInAt);
  assert.equal(result.documentsRebound, 1);

  const newHost = getVisitHostState(db, result.visitId);
  assert.equal(newHost?.checkinPhone, '+49172111111');
  assert.equal(newHost?.callbackPhone, '+49172222222');
  assert.equal(newHost?.identityRefOverride, 'Max Test');
  assert.equal(newHost?.triageLevel, 'yellow');
  assert.equal(newHost?.absentMode, null);

  const doc = db.prepare('SELECT visit_id AS visitId FROM documents WHERE id = ?').get('doc1') as {
    visitId: string;
  };
  assert.equal(doc.visitId, result.visitId);

  const session = db
    .prepare('SELECT status AS status FROM patient_sessions WHERE id = ?')
    .get('sess1') as { status: string };
  assert.equal(session.status, 'revoked');

  const later = runtime.checkIn({
    topicId: 'termin-habe',
    surfaceId: PF_FLOW_SURFACE_TERMINAL,
  });
  assert.ok(later);
  assert.ok(later.checkedInAt);
  assert.ok(later.checkedInAt! > preservedCheckedInAt!);

  const rows = listVisitQueueRows(runtime, settings, getBusinessDay(), db);
  const ids = rows.map((row) => row.id);
  assert.equal(ids.includes(source.id), false);
  assert.ok(ids.includes(result.visitId));
  assert.ok(ids.includes(later.id));
  assert.ok(ids.indexOf(result.visitId) < ids.indexOf(later.id));

  const supersededRow = rows.find((row) => row.id === result.visitId);
  assert.equal(supersededRow?.createdAt, preservedCheckedInAt);
});
