import type { DatabaseSync } from 'node:sqlite';

/** Führt `fn` in einer SQLite-Transaktion aus. Bei Fehler: vollständiger Rollback. */
export function runInTransaction<T>(db: DatabaseSync, fn: () => T): T {
  const savepointName = `flow_core_tx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  db.exec(`SAVEPOINT ${savepointName}`);
  try {
    const result = fn();
    db.exec(`RELEASE SAVEPOINT ${savepointName}`);
    return result;
  } catch (error) {
    db.exec(`ROLLBACK TO SAVEPOINT ${savepointName}`);
    db.exec(`RELEASE SAVEPOINT ${savepointName}`);
    throw error;
  }
}
