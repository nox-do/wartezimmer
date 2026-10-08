import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import {
  ensureVisitRecallConsentSchema,
  recordVisitRecallConsent,
  clearVisitRecallConsent,
  hasVisitRecallConsent,
} from './visit-recall-consent.js';

test('oral consent evidence persists with MFA session, time and wording version and follows visit deletion', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(
      "PRAGMA foreign_keys = ON; CREATE TABLE visits (id TEXT PRIMARY KEY); INSERT INTO visits VALUES ('visit-1')",
    );
    ensureVisitRecallConsentSchema(db);
    ensureVisitRecallConsentSchema(db);
    recordVisitRecallConsent(
      db,
      'visit-1',
      '+4917612345678',
      '2026-10-08T10:00:00Z',
      'mfa-session',
    );
    const row = db.prepare('SELECT * FROM visit_recall_consent').get();
    assert.equal(row?.actor_id, 'mfa-session');
    assert.equal(row?.confirmed_at, '2026-10-08T10:00:00Z');
    assert.equal(row?.wording_version, 'mfa-oral-recall-v1');
    assert.equal(hasVisitRecallConsent(db, 'visit-1', '+4917612345678'), true);
    assert.equal(hasVisitRecallConsent(db, 'visit-2', '+4917612345678'), false);
    recordVisitRecallConsent(
      db,
      'visit-1',
      '+4917612345679',
      '2026-10-08T10:05:00Z',
      'mfa-session-2',
    );
    assert.equal(hasVisitRecallConsent(db, 'visit-1', '+4917612345678'), false);
    clearVisitRecallConsent(db, 'visit-1');
    assert.equal(hasVisitRecallConsent(db, 'visit-1', '+4917612345679'), false);
    recordVisitRecallConsent(db, 'visit-1', '+4917612345679', '2026-10-08T10:05:00Z');
    db.exec('DELETE FROM visits');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM visit_recall_consent').get()?.count, 0);
  } finally {
    db.close();
  }
});
