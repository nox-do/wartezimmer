import type { DatabaseSync } from 'node:sqlite';

function tableHasColumn(db: DatabaseSync, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: string }>;
  return rows.some((row) => row.name === column);
}

function visitsTableExists(db: DatabaseSync): boolean {
  const row = db
    .prepare("SELECT 1 AS exists_flag FROM sqlite_master WHERE type = 'table' AND name = 'visits' LIMIT 1")
    .get() as { exists_flag?: number } | undefined;
  return row?.exists_flag === 1;
}

function tableReferencesVisits(db: DatabaseSync, table: string): boolean {
  const rows = db.prepare(`PRAGMA foreign_key_list(${table})`).all() as Array<{ table?: string }>;
  return rows.some((row) => row.table === 'visits');
}

function ensurePatientSessionsVisitFk(db: DatabaseSync): void {
  if (tableReferencesVisits(db, 'patient_sessions')) {
    return;
  }

  db.exec('DROP INDEX IF EXISTS idx_patient_sessions_visit');
  db.exec('DROP INDEX IF EXISTS idx_patient_sessions_one_active_visit');

  db.exec(`
    CREATE TABLE patient_sessions__visit_fk (
      id TEXT PRIMARY KEY,
      visit_id TEXT NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK (status IN ('active', 'expired', 'revoked')),
      expires_at TEXT NOT NULL,
      last_seen_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    INSERT INTO patient_sessions__visit_fk (
      id, visit_id, token_hash, status, expires_at, last_seen_at, created_at, updated_at
    )
    SELECT id, visit_id, token_hash, status, expires_at, last_seen_at, created_at, updated_at
    FROM patient_sessions;

    DROP TABLE patient_sessions;
    ALTER TABLE patient_sessions__visit_fk RENAME TO patient_sessions;

    CREATE INDEX IF NOT EXISTS idx_patient_sessions_visit ON patient_sessions(visit_id);
    CREATE INDEX IF NOT EXISTS idx_patient_sessions_status_expires ON patient_sessions(status, expires_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_sessions_one_active_visit
      ON patient_sessions(visit_id)
      WHERE status = 'active';
  `);
}

function ensureDocumentsVisitFk(db: DatabaseSync): void {
  if (tableReferencesVisits(db, 'documents')) {
    return;
  }

  db.exec('DROP INDEX IF EXISTS idx_documents_visit');
  db.exec('DROP TRIGGER IF EXISTS documents_template_metadata_insert_guard');
  db.exec('DROP TRIGGER IF EXISTS documents_template_metadata_update_guard');

  db.exec(`
    CREATE TABLE documents__visit_fk (
      id TEXT PRIMARY KEY,
      visit_id TEXT NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL REFERENCES patient_sessions(id) ON DELETE CASCADE,
      source TEXT NOT NULL CHECK (source IN ('upload', 'form')),
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      template_id TEXT,
      template_version INTEGER,
      status TEXT NOT NULL CHECK (
        status IN (
          'received',
          'scanning',
          'scan_clean',
          'blocked_malware',
          'scan_error',
          'preview_requested',
          'discarded_by_patient',
          'discarded_by_mfa',
          'export_requested',
          'exported'
        )
      ),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    INSERT INTO documents__visit_fk (
      id, visit_id, session_id, source, file_name, mime_type, size_bytes,
      template_id, template_version, status, created_at, updated_at
    )
    SELECT
      id, visit_id, session_id, source, file_name, mime_type, size_bytes,
      template_id, template_version, status, created_at, updated_at
    FROM documents;

    DROP TABLE documents;
    ALTER TABLE documents__visit_fk RENAME TO documents;

    CREATE INDEX IF NOT EXISTS idx_documents_visit ON documents(visit_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_documents_session ON documents(session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status, created_at);
  `);

  recreateDocumentTemplateTriggers(db);
}

function migratePatientSessionsToVisitId(db: DatabaseSync): void {
  db.exec('DROP INDEX IF EXISTS idx_patient_sessions_ticket');
  db.exec('DROP INDEX IF EXISTS idx_patient_sessions_one_active_ticket');

  db.exec(`
    CREATE TABLE patient_sessions__visit_portal (
      id TEXT PRIMARY KEY,
      visit_id TEXT NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK (status IN ('active', 'expired', 'revoked')),
      expires_at TEXT NOT NULL,
      last_seen_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    INSERT INTO patient_sessions__visit_portal (
      id, visit_id, token_hash, status, expires_at, last_seen_at, created_at, updated_at
    )
    SELECT id, ticket_id, token_hash, status, expires_at, last_seen_at, created_at, updated_at
    FROM patient_sessions;

    DROP TABLE patient_sessions;
    ALTER TABLE patient_sessions__visit_portal RENAME TO patient_sessions;

    CREATE INDEX IF NOT EXISTS idx_patient_sessions_visit ON patient_sessions(visit_id);
    CREATE INDEX IF NOT EXISTS idx_patient_sessions_status_expires ON patient_sessions(status, expires_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_sessions_one_active_visit
      ON patient_sessions(visit_id)
      WHERE status = 'active';
  `);
}

function recreateDocumentTemplateTriggers(db: DatabaseSync): void {
  db.exec('DROP TRIGGER IF EXISTS documents_template_metadata_insert_guard');
  db.exec('DROP TRIGGER IF EXISTS documents_template_metadata_update_guard');
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS documents_template_metadata_insert_guard
    BEFORE INSERT ON documents
    FOR EACH ROW
    WHEN (
      (NEW.source = 'form' AND (NEW.template_id IS NULL OR NEW.template_version IS NULL OR NEW.template_version < 1))
      OR
      (NEW.source != 'form' AND (NEW.template_id IS NOT NULL OR NEW.template_version IS NOT NULL))
    )
    BEGIN
      SELECT RAISE(ABORT, 'DOCUMENT_TEMPLATE_METADATA_INVALID');
    END;

    CREATE TRIGGER IF NOT EXISTS documents_template_metadata_update_guard
    BEFORE UPDATE ON documents
    FOR EACH ROW
    WHEN (
      (NEW.source = 'form' AND (NEW.template_id IS NULL OR NEW.template_version IS NULL OR NEW.template_version < 1))
      OR
      (NEW.source != 'form' AND (NEW.template_id IS NOT NULL OR NEW.template_version IS NOT NULL))
    )
    BEGIN
      SELECT RAISE(ABORT, 'DOCUMENT_TEMPLATE_METADATA_INVALID');
    END;
  `);
}

function migrateDocumentsToVisitId(db: DatabaseSync): void {
  db.exec('DROP INDEX IF EXISTS idx_documents_ticket');
  db.exec('DROP TRIGGER IF EXISTS documents_template_metadata_insert_guard');
  db.exec('DROP TRIGGER IF EXISTS documents_template_metadata_update_guard');

  db.exec(`
    CREATE TABLE documents__visit_portal (
      id TEXT PRIMARY KEY,
      visit_id TEXT NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL REFERENCES patient_sessions(id) ON DELETE CASCADE,
      source TEXT NOT NULL CHECK (source IN ('upload', 'form')),
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      template_id TEXT,
      template_version INTEGER,
      status TEXT NOT NULL CHECK (
        status IN (
          'received',
          'scanning',
          'scan_clean',
          'blocked_malware',
          'scan_error',
          'preview_requested',
          'discarded_by_patient',
          'discarded_by_mfa',
          'export_requested',
          'exported'
        )
      ),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    INSERT INTO documents__visit_portal (
      id, visit_id, session_id, source, file_name, mime_type, size_bytes,
      template_id, template_version, status, created_at, updated_at
    )
    SELECT
      id, ticket_id, session_id, source, file_name, mime_type, size_bytes,
      template_id, template_version, status, created_at, updated_at
    FROM documents;

    DROP TABLE documents;
    ALTER TABLE documents__visit_portal RENAME TO documents;

    CREATE INDEX IF NOT EXISTS idx_documents_visit ON documents(visit_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_documents_session ON documents(session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status, created_at);
  `);

  recreateDocumentTemplateTriggers(db);
}

/**
 * Phase B2: portal sessions + documents reference visits(id) instead of tickets(id).
 * Idempotent — skips when columns are already visit_id.
 */
export function ensureVisitPortalSchema(db: DatabaseSync): void {
  if (!visitsTableExists(db)) {
    return;
  }

  const patientSessionsExists = db
    .prepare(
      "SELECT 1 AS exists_flag FROM sqlite_master WHERE type = 'table' AND name = 'patient_sessions' LIMIT 1",
    )
    .get() as { exists_flag?: number } | undefined;
  if (patientSessionsExists?.exists_flag !== 1) {
    return;
  }

  db.exec('PRAGMA foreign_keys = OFF');
  try {
    if (tableHasColumn(db, 'patient_sessions', 'ticket_id')) {
      migratePatientSessionsToVisitId(db);
    } else if (tableHasColumn(db, 'patient_sessions', 'visit_id')) {
      ensurePatientSessionsVisitFk(db);
    }
    if (tableHasColumn(db, 'documents', 'ticket_id')) {
      migrateDocumentsToVisitId(db);
    } else if (tableHasColumn(db, 'documents', 'visit_id')) {
      ensureDocumentsVisitFk(db);
    }
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}
