import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_TERMINAL_TOPIC_DEFINITIONS } from '../checkin-topic-settings.js';
import { ensureFlowCoreSchema } from '../flow-core/flow-core-schema.js';
import { syncFlowCoreCatalog, getFlowCoreRuntime } from '../flow-core/flow-core-runtime.js';
import { createVisitCheckInInDb } from '../flow-core/flow-core-checkin.js';
import { setVisitAbsent } from '../flow-core/visit-queue-bridge.js';
import { formatTicketCode } from '../queue/ticket-code.js';
import { getBusinessDay, normalizeDayClosePhase } from './database-time.js';
import type { CheckinSessionDeps } from './database-checkin-sessions.js';
import {
  getVisitIdentityViewFromDb,
  getVisitPortalContextFromDb,
  requirePatientSessionFromDb,
  resolvePatientSessionInDb,
  verifyTicketCodeInDb,
} from './database-checkin-sessions.js';
import { intakePatientDocumentInDb, type DocumentDeps } from './database-documents.js';
import { prepareCoreDatabaseStatements } from './database-statements.js';
import type { OpsSettings } from './db-types.js';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

function tableHasColumn(db: DatabaseSync, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: string }>;
  return rows.some((row) => row.name === column);
}

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
    updatedAt: '2026-07-05T12:00:00.000Z',
  };
}

function seedOpsState(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ops_state (
      id TEXT PRIMARY KEY,
      checkin_locked INTEGER NOT NULL DEFAULT 0,
      day_close_phase TEXT NOT NULL DEFAULT 'open',
      last_reset_business_day TEXT,
      updated_at TEXT NOT NULL
    );
    INSERT OR IGNORE INTO ops_state (id, checkin_locked, day_close_phase, last_reset_business_day, updated_at)
    VALUES ('singleton', 0, 'open', '${getBusinessDay()}', '2026-07-05T12:00:00.000Z');
  `);
}

function buildCheckinDeps(
  db: DatabaseSync,
  settings: OpsSettings,
): { deps: CheckinSessionDeps; stmts: ReturnType<typeof prepareCoreDatabaseStatements> } {
  seedOpsState(db);
  const stmts = prepareCoreDatabaseStatements(db);
  const deps: CheckinSessionDeps = {
    ...stmts,
    nowIso: () => '2026-07-05T12:00:00.000Z',
    getBusinessDay,
    getBusinessTimeZone: () => 'Europe/Berlin',
    getOpsSettings: () => settings,
    normalizeDayClosePhase,
    emitOutboxEvent: () => undefined,
  };
  return { deps, stmts };
}

function buildDocumentDeps(
  db: DatabaseSync,
  stmts: ReturnType<typeof prepareCoreDatabaseStatements>,
  checkinDeps: CheckinSessionDeps,
): DocumentDeps {
  return {
    insertDocumentStmt: stmts.insertDocumentStmt,
    listPatientDocumentsStmt: stmts.listPatientDocumentsStmt,
    getSessionDocumentStmt: stmts.getSessionDocumentStmt,
    getDocumentByIdStmt: stmts.getDocumentByIdStmt,
    getDocumentExportInfoStmt: stmts.getDocumentExportInfoStmt,
    updateDocumentStatusStmt: stmts.updateDocumentStatusStmt,
    updateDocumentFileNameStmt: stmts.updateDocumentFileNameStmt,
    listDocumentsByVisitStmt: stmts.listDocumentsByVisitStmt,
    visitExists: (visitId: string) =>
      Boolean(
        db.prepare('SELECT 1 AS f FROM visits WHERE id = ? LIMIT 1').get(visitId) as
          | { f?: number }
          | undefined,
      ),
    nowIso: checkinDeps.nowIso,
    emitOutboxEvent: checkinDeps.emitOutboxEvent,
    requirePatientSession: (sessionToken) => requirePatientSessionFromDb(checkinDeps, sessionToken),
  };
}

function setupVisitPortalFlow(): {
  db: DatabaseSync;
  settings: OpsSettings;
  visitId: string;
  ticketCode: string;
  checkinDeps: CheckinSessionDeps;
  documentDeps: DocumentDeps;
} {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(readFileSync(join(migrationsDir, '001_baseline.sql'), 'utf8'));
  ensureFlowCoreSchema(db);
  const settings = sampleSettings();
  syncFlowCoreCatalog(db, settings);
  const { deps: checkinDeps, stmts } = buildCheckinDeps(db, settings);
  const documentDeps = buildDocumentDeps(db, stmts, checkinDeps);
  const created = createVisitCheckInInDb(
    { ...checkinDeps, db },
    {
      topicId: 'blut',
      authPath: 'phone_dob',
      checkinPhone: '+49172111111',
      checkinLocale: 'de',
      identityRef: 'Portal Patient',
    },
  );
  const visit = getFlowCoreRuntime(db)
    .visits()
    .find((entry) => entry.id === created.visitId);
  assert.ok(visit);
  const ticketCode = formatTicketCode(visit.queueLaneCode, created.number);
  return {
    db,
    settings,
    visitId: created.visitId,
    ticketCode,
    checkinDeps,
    documentDeps,
  };
}

test('ensureVisitPortalSchema ensures visit_id columns with FK to visits on fresh baseline', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(readFileSync(join(migrationsDir, '001_baseline.sql'), 'utf8'));
  ensureFlowCoreSchema(db);

  assert.equal(tableHasColumn(db, 'patient_sessions', 'ticket_id'), false);
  assert.equal(tableHasColumn(db, 'patient_sessions', 'visit_id'), true);
  assert.equal(tableHasColumn(db, 'documents', 'ticket_id'), false);
  assert.equal(tableHasColumn(db, 'documents', 'visit_id'), true);
});

test('visit portal: verify code, resolve session, identity view with host-state', () => {
  const { checkinDeps, visitId, ticketCode } = setupVisitPortalFlow();

  const verified = verifyTicketCodeInDb(checkinDeps, ticketCode);
  assert.equal(verified.visitId, visitId);

  const session = resolvePatientSessionInDb(checkinDeps, ticketCode);
  assert.equal(session.visitId, visitId);
  assert.ok(session.sessionToken);

  const portal = getVisitPortalContextFromDb(checkinDeps, visitId);
  assert.equal(portal.authPath, 'phone_dob');
  assert.equal('checkinPhone' in portal, false);

  const identity = getVisitIdentityViewFromDb(checkinDeps, visitId);
  assert.equal(identity.visitId, visitId);
  assert.equal(identity.status, 'waiting');
  assert.equal(identity.identityRef, 'Portal Patient');
});

test('visit portal: document intake uses visit_id FK', () => {
  const { checkinDeps, documentDeps, ticketCode } = setupVisitPortalFlow();
  const session = resolvePatientSessionInDb(checkinDeps, ticketCode);

  const doc = intakePatientDocumentInDb(documentDeps, session.sessionToken, {
    source: 'upload',
    fileName: 'befund.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    status: 'received',
  });

  assert.equal(doc.visitId, session.visitId);
  assert.equal(doc.fileName, 'befund.pdf');
});

test('identity view reflects absent host overlay', () => {
  const { db, checkinDeps, settings, visitId } = setupVisitPortalFlow();
  const runtime = getFlowCoreRuntime(db);
  setVisitAbsent(db, runtime, settings, visitId, 'wait_here', '2026-07-05T12:10:00.000Z');

  const identity = getVisitIdentityViewFromDb(checkinDeps, visitId);
  assert.equal(identity.status, 'absent_wait_here');
});
