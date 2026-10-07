import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { DomainError } from '../errors/domain-error.js';
import { CoreDatabase } from './database.js';

function openCoreDatabase(): {
  core: CoreDatabase;
  inspect: DatabaseSync;
  cleanup: () => void;
} {
  const dir = mkdtempSync(join(tmpdir(), 'pf-db-session-tx-'));
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

function createActiveSession(core: CoreDatabase): { visitId: string; sessionToken: string } {
  seedOpenBusinessDay(core);
  const created = core.createTicket({
    topicId: 'blut',
    authPath: 'phone_dob',
    identityRef: 'Session TX',
  });
  const ticketCode = core.getTicketCodeByVisitId(created.visitId);
  const session = core.resolvePatientSession(ticketCode);
  return { visitId: created.visitId, sessionToken: session.sessionToken };
}

function sessionRow(
  inspect: DatabaseSync,
  visitId: string,
): { status: string; lastSeenAt: string | null } {
  const row = inspect
    .prepare(
      `SELECT status AS status, last_seen_at AS lastSeenAt
       FROM patient_sessions WHERE visit_id = ? LIMIT 1`,
    )
    .get(visitId) as { status?: string; lastSeenAt?: string | null } | undefined;
  assert.ok(row?.status);
  return { status: row.status, lastSeenAt: row.lastSeenAt ?? null };
}

test('getPatientSession touches last_seen inside a committed write TX', () => {
  const { core, inspect, cleanup } = openCoreDatabase();
  try {
    const { visitId, sessionToken } = createActiveSession(core);
    assert.equal(sessionRow(inspect, visitId).lastSeenAt, null);

    const session = core.getPatientSession(sessionToken);
    assert.equal(session.visitId, visitId);
    assert.ok(sessionRow(inspect, visitId).lastSeenAt);
  } finally {
    cleanup();
  }
});

test('getPatientSession keeps expire mark when throwing SESSION_EXPIRED', () => {
  const { core, inspect, cleanup } = openCoreDatabase();
  try {
    const { visitId, sessionToken } = createActiveSession(core);
    inspect
      .prepare(`UPDATE patient_sessions SET expires_at = ? WHERE visit_id = ?`)
      .run('2000-01-01T00:00:00.000Z', visitId);

    assert.throws(
      () => core.getPatientSession(sessionToken),
      (error: unknown) => error instanceof DomainError && error.domainCode === 'SESSION_EXPIRED',
    );
    assert.equal(sessionRow(inspect, visitId).status, 'expired');
  } finally {
    cleanup();
  }
});

test('listPatientDocuments touches session then returns rows in one TX', () => {
  const { core, inspect, cleanup } = openCoreDatabase();
  try {
    const { visitId, sessionToken } = createActiveSession(core);
    core.intakePatientDocument(sessionToken, {
      fileName: 'scan.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 12,
      status: 'received',
    });

    const docs = core.listPatientDocuments(sessionToken);
    assert.equal(docs.length, 1);
    assert.ok(sessionRow(inspect, visitId).lastSeenAt);
  } finally {
    cleanup();
  }
});
