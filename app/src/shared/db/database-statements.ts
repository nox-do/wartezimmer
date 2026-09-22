import type { DatabaseSync } from 'node:sqlite';
import { prepareDocumentDatabaseStatements } from './database-document-statements.js';
import { prepareOpsDatabaseStatements } from './database-ops-statements.js';
import { prepareOutboxDatabaseStatements } from './database-outbox-statements.js';
import { prepareSessionDatabaseStatements } from './database-session-statements.js';
import { prepareVisitDatabaseStatements } from './database-visit-statements.js';
import { prepareSandboxResetStateStatements } from './database-sandbox-reset-state.js';

/** Kompatible Gesamtmenge für CoreDatabase; spezialisierte Nutzer laden nur ihre Fachgruppe. */
export function prepareCoreDatabaseStatements(db: DatabaseSync) {
  return {
    ...prepareOpsDatabaseStatements(db),
    ...prepareVisitDatabaseStatements(db),
    ...prepareSessionDatabaseStatements(db),
    ...prepareOutboxDatabaseStatements(db),
    ...prepareDocumentDatabaseStatements(db),
    ...prepareSandboxResetStateStatements(db),
  };
}
