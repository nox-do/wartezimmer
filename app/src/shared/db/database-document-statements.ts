import { PENDING_DOCUMENT_STATUSES } from '../documents/document-status-rules.js';
import type { DatabaseSync } from 'node:sqlite';

export function prepareDocumentDatabaseStatements(db: DatabaseSync) {
  return {
    insertDocumentStmt: db.prepare(
      `INSERT INTO documents (
        id, visit_id, session_id, source, file_name, mime_type, size_bytes, status, template_id, template_version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    listPatientDocumentsStmt: db.prepare(
      `SELECT
        id,
        visit_id AS visitId,
        file_name AS fileName,
        mime_type AS mimeType,
        size_bytes AS sizeBytes,
        status,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM documents
      WHERE session_id = ?
      ORDER BY created_at DESC`,
    ),
    getSessionDocumentStmt: db.prepare(
      'SELECT id, session_id AS sessionId, status FROM documents WHERE id = ? LIMIT 1',
    ),
    getDocumentByIdStmt: db.prepare(
      `SELECT
        id,
        visit_id AS visitId,
        session_id AS sessionId,
        source,
        file_name AS fileName,
        mime_type AS mimeType,
        size_bytes AS sizeBytes,
        status,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM documents
      WHERE id = ?
      LIMIT 1`,
    ),
    getDocumentExportInfoStmt: db.prepare(
      `SELECT
        d.id AS documentId,
        d.visit_id AS visitId,
        v.queue_lane_code AS ticketLaneCode,
        v.queue_sequence AS ticketNumber,
        COALESCE(h.identity_ref_override, p.display_name) AS identityRef,
        d.file_name AS fileName,
        d.mime_type AS mimeType,
        d.source AS source,
        d.status AS status
      FROM documents d
      JOIN visits v ON v.id = d.visit_id
      LEFT JOIN patients p ON p.id = v.patient_id
      LEFT JOIN visit_host_state h ON h.visit_id = v.id
      WHERE d.id = ?
      LIMIT 1`,
    ),
    updateDocumentStatusStmt: db.prepare(
      'UPDATE documents SET status = ?, updated_at = ? WHERE id = ?',
    ),
    updateDocumentFileNameStmt: db.prepare(
      'UPDATE documents SET file_name = ?, updated_at = ? WHERE id = ?',
    ),
    listDocumentsByVisitStmt: db.prepare(
      `SELECT
        id,
        visit_id AS visitId,
        session_id AS sessionId,
        source,
        file_name AS fileName,
        mime_type AS mimeType,
        size_bytes AS sizeBytes,
        status,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM documents
      WHERE visit_id = ?
        AND status IN (${PENDING_DOCUMENT_STATUSES.map((status) => `'${status}'`).join(', ')})
      ORDER BY created_at DESC`,
    ),
  };
}
