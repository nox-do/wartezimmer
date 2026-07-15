import type { DatabaseSync } from 'node:sqlite';

/** Führt `fn` in einer SQLite-Transaktion aus. Bei Fehler: vollständiger Rollback. */
export function runInTransaction<T>(db: DatabaseSync, fn: () => T): T {
  const nested = db.isTransaction;
  const savepointName = `flow_core_tx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  db.exec(nested ? `SAVEPOINT ${savepointName}` : 'BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec(nested ? `RELEASE SAVEPOINT ${savepointName}` : 'COMMIT');
    return result;
  } catch (error) {
    if (nested) {
      db.exec(`ROLLBACK TO SAVEPOINT ${savepointName}`);
      db.exec(`RELEASE SAVEPOINT ${savepointName}`);
    } else {
      db.exec('ROLLBACK');
    }
    throw error;
  }
}
