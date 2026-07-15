import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { runInTransaction } from '@praxis-flow/flow-core/server';

test('runInTransaction nutzt innerhalb einer Host-Transaktion einen Savepoint', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE entries (value TEXT NOT NULL)');
  db.exec('BEGIN IMMEDIATE');
  db.prepare('INSERT INTO entries VALUES (?)').run('outer');

  assert.throws(
    () =>
      runInTransaction(db, () => {
        db.prepare('INSERT INTO entries VALUES (?)').run('rolled-back');
        throw new Error('TEST_FAILURE');
      }),
    /TEST_FAILURE/,
  );
  assert.equal(db.isTransaction, true);

  runInTransaction(db, () => {
    db.prepare('INSERT INTO entries VALUES (?)').run('nested');
  });
  db.exec('COMMIT');

  assert.deepEqual(
    db
      .prepare('SELECT value FROM entries ORDER BY rowid')
      .all()
      .map((row) => row.value),
    ['outer', 'nested'],
  );
});
