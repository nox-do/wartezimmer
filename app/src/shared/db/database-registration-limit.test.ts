import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { CoreDatabase } from './database.js';
import { getBusinessDay } from './database-time.js';

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'pf-registration-limit-'));
  const previous = process.env.CONTACT_LOOKUP_BASE_PATH;
  process.env.CONTACT_LOOKUP_BASE_PATH = join(dir, 'imports');
  const dbPath = join(dir, 'app.db');
  const core = new CoreDatabase(dbPath);
  const db = new DatabaseSync(dbPath);
  core.resetBusinessDay();
  core.setCheckinLock(false);
  const settings = core.getOpsSettings();
  const topic = settings.topics.find((item) => item.topicId === 'offen')!;
  core.updateOpsSettings({
    practiceOpenFrom: '00:00',
    practiceOpenTo: '23:59',
    topics: [
      ...settings.topics.map((item) => ({ ...item, availableFrom: null, availableTo: null })),
      {
        ...topic,
        topicId: 'offen-zwei',
        label: 'Auch offen',
        availableFrom: null,
        availableTo: null,
      },
    ],
  });
  return {
    core,
    db,
    counter(lane: string, value: number, day = getBusinessDay()) {
      db.prepare(
        'INSERT INTO daily_queue_counters (scope, counter_date, next_value) VALUES (?, ?, ?) ON CONFLICT(scope, counter_date) DO UPDATE SET next_value=excluded.next_value',
      ).run(`lane:${lane}`, day, value);
    },
    cleanup() {
      db.close();
      if (previous === undefined) delete process.env.CONTACT_LOOKUP_BASE_PATH;
      else process.env.CONTACT_LOOKUP_BASE_PATH = previous;
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('999 is issued, the next allocation rolls back for every topic sharing the lane', () => {
  const f = fixture();
  try {
    f.counter('O', 998);
    assert.equal(f.core.isRegistrationBlocked('offen'), false);
    assert.equal(f.core.createTicket({ topicId: 'offen', authPath: 'name_dob' }).number, 999);
    assert.equal(f.core.isRegistrationBlocked('offen'), true);
    assert.equal(f.core.isRegistrationBlocked('offen-zwei'), true);
    const before = f.core.listQueue();
    for (const topicId of ['offen', 'offen-zwei']) {
      assert.throws(
        () => f.core.createTicket({ topicId, authPath: 'name_dob' }),
        /REGISTRATION_LIMIT_REACHED/,
      );
    }
    assert.deepEqual(f.core.listQueue(), before);
    assert.equal(
      f.db
        .prepare('SELECT next_value FROM daily_queue_counters WHERE scope=? AND counter_date=?')
        .get('lane:O', getBusinessDay())?.next_value,
      999,
    );
    assert.equal(f.core.createTicket({ topicId: 'blut', authPath: 'name_dob' }).number, 1);
    // The reusable Core itself remains able to allocate beyond the host limit.
    assert.equal(
      f.core
        .getFlowCoreRuntimeInstance()
        .checkIn({ topicId: 'offen', authPath: 'name_dob', surfaceId: 'pf_terminal_1' })
        .queueSequence,
      1000,
    );
  } finally {
    f.cleanup();
  }
});

test('rejected topic changes preserve source visit, sessions, audit and outbox', () => {
  const f = fixture();
  try {
    const source = f.core.createTicket({ topicId: 'blut', authPath: 'name_dob' });
    f.core.resolvePatientSession(f.core.getTicketCodeByVisitId(source.visitId));
    f.counter('O', 999);
    const snapshot = () =>
      [
        'visits',
        'visit_events',
        'documents',
        'patient_sessions',
        'outbox_events',
        'daily_queue_counters',
      ].map((table) => f.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
    const before = snapshot();
    assert.throws(
      () => f.core.supersedeVisit(source.visitId, 'offen'),
      /REGISTRATION_LIMIT_REACHED/,
    );
    assert.deepEqual(snapshot(), before);
  } finally {
    f.cleanup();
  }
});

test('reception and assistance share the limit, previous day counters do not block today', () => {
  const f = fixture();
  try {
    f.counter('M', 999);
    for (const needsAssistance of [false, true]) {
      assert.throws(
        () => f.core.createTicket({ topicId: 'mfa', authPath: 'none', needsAssistance }),
        /REGISTRATION_LIMIT_REACHED/,
      );
    }
    f.counter('O', 999, '2000-01-01');
    assert.equal(f.core.isRegistrationBlocked('offen'), false);
    assert.equal(f.core.createTicket({ topicId: 'offen', authPath: 'name_dob' }).number, 1);
  } finally {
    f.cleanup();
  }
});
