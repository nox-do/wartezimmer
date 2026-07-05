import { randomUUID } from 'node:crypto';
import type { StatementSync } from 'node:sqlite';
import type {
  DocumentExportInfo,
  DocumentStatus,
  MfaDocumentRow,
  PatientDocumentRow,
  PatientSession,
} from './db-types.js';
import { isDocumentPreviewable } from '../documents/document-status-rules.js';
import { buildDocumentFileNameFromBase } from '../documents/document-rename.js';
import { domainError } from '../errors/domain-error.js';

type DocumentStatements = {
  insertDocumentStmt: StatementSync;
  listPatientDocumentsStmt: StatementSync;
  getSessionDocumentStmt: StatementSync;
  getDocumentByIdStmt: StatementSync;
  getDocumentExportInfoStmt: StatementSync;
  updateDocumentStatusStmt: StatementSync;
  updateDocumentFileNameStmt: StatementSync;
  listDocumentsByVisitStmt: StatementSync;
  visitExists: (visitId: string) => boolean;
};

type DocumentHelpers = {
  nowIso: () => string;
  emitOutboxEvent: (
    eventType: string,
    aggregateId: string,
    payload: Record<string, unknown>,
  ) => void;
  requirePatientSession: (sessionToken: string) => PatientSession;
};

export type DocumentDeps = DocumentStatements & DocumentHelpers;

function applyDocumentStatusTransition(
  deps: DocumentDeps,
  input: {
    documentId: string;
    toStatus: string;
    updatedAt: string;
    eventType: string;
    eventPayload: Record<string, unknown>;
  },
): void {
  deps.updateDocumentStatusStmt.run(input.toStatus, input.updatedAt, input.documentId);
  deps.emitOutboxEvent(input.eventType, input.documentId, input.eventPayload);
}

export function requireDocumentByIdFromDb(
  deps: Pick<DocumentDeps, 'getDocumentByIdStmt'>,
  documentId: string,
): MfaDocumentRow {
  const document = deps.getDocumentByIdStmt.get(documentId) as MfaDocumentRow | undefined;
  if (!document?.id) {
    throw domainError('DOCUMENT_NOT_FOUND');
  }

  return document;
}

export function getDocumentByIdFromDb(deps: DocumentDeps, documentId: string): MfaDocumentRow {
  return requireDocumentByIdFromDb(deps, documentId);
}

export function getDocumentExportInfoFromDb(
  deps: DocumentDeps,
  documentId: string,
): DocumentExportInfo {
  const row = deps.getDocumentExportInfoStmt.get(documentId) as DocumentExportInfo | undefined;
  if (!row?.documentId) {
    throw domainError('DOCUMENT_NOT_FOUND');
  }
  return row;
}

export function getDocumentForPreviewRequestFromDb(
  deps: DocumentDeps,
  documentId: string,
): MfaDocumentRow {
  const document = requireDocumentByIdFromDb(deps, documentId);
  if (!isDocumentPreviewable(document.source, document.status)) {
    throw domainError('INVALID_TRANSITION');
  }
  return document;
}

export type PatientDocumentIntakeInput = {
  documentId?: string;
  source: 'upload' | 'form';
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  templateId?: string | null;
  templateVersion?: number | null;
};

export function intakePatientDocumentInDb(
  deps: DocumentDeps,
  sessionToken: string,
  input: PatientDocumentIntakeInput,
): PatientDocumentRow {
  const session = deps.requirePatientSession(sessionToken);
  const createdAt = deps.nowIso();
  const documentId = input.documentId ?? randomUUID();
  const templateId = input.source === 'form' ? (input.templateId ?? null) : null;
  const templateVersion = input.source === 'form' ? (input.templateVersion ?? null) : null;

  deps.insertDocumentStmt.run(
    documentId,
    session.visitId,
    session.sessionId,
    input.source,
    input.fileName,
    input.mimeType,
    input.sizeBytes,
    input.status,
    templateId,
    templateVersion,
    createdAt,
    createdAt,
  );

  deps.emitOutboxEvent('DocumentIntakeReceived', documentId, {
    documentId,
    visitId: session.visitId,
    sessionId: session.sessionId,
    source: input.source,
    templateId: templateId ?? undefined,
    templateVersion: templateVersion ?? undefined,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    status: input.status,
    createdAt,
  });

  return {
    id: documentId,
    visitId: session.visitId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    status: input.status,
    createdAt,
    updatedAt: createdAt,
  };
}

export type FormDocumentIntakeInput = PatientDocumentIntakeInput & {
  source: 'form';
  templateId: string;
  templateVersion: number;
};

export function intakeFormDocumentsInDb(
  deps: DocumentDeps,
  sessionToken: string,
  inputs: FormDocumentIntakeInput[],
): PatientDocumentRow[] {
  return inputs.map((input) => intakePatientDocumentInDb(deps, sessionToken, input));
}

export function listPatientDocumentsInDb(
  deps: DocumentDeps,
  sessionToken: string,
): PatientDocumentRow[] {
  const session = deps.requirePatientSession(sessionToken);
  return deps.listPatientDocumentsStmt.all(session.sessionId) as PatientDocumentRow[];
}

export function discardPatientDocumentInDb(
  deps: DocumentDeps,
  sessionToken: string,
  documentId: string,
): PatientDocumentRow {
  const session = deps.requirePatientSession(sessionToken);
  const document = deps.getSessionDocumentStmt.get(documentId) as
    | { id?: string; sessionId?: string; status?: string }
    | undefined;
  if (!document?.id || !document.sessionId || !document.status) {
    throw domainError('DOCUMENT_NOT_FOUND');
  }
  if (document.sessionId !== session.sessionId) {
    throw domainError('DOCUMENT_FORBIDDEN');
  }
  const allowedPatientDiscard = new Set<DocumentStatus>([
    'scan_clean',
    'blocked_malware',
    'scan_error',
    'received',
  ]);
  if (!allowedPatientDiscard.has(document.status as DocumentStatus)) {
    throw domainError('INVALID_TRANSITION');
  }

  const updatedAt = deps.nowIso();
  applyDocumentStatusTransition(deps, {
    documentId,
    toStatus: 'discarded_by_patient',
    updatedAt,
    eventType: 'DocumentLifecycleChanged',
    eventPayload: {
      documentId,
      visitId: session.visitId,
      sessionId: session.sessionId,
      fromStatus: document.status,
      toStatus: 'discarded_by_patient',
      updatedAt,
    },
  });

  const updated = requireDocumentByIdFromDb(deps, documentId);
  return {
    id: updated.id,
    visitId: updated.visitId,
    fileName: updated.fileName,
    mimeType: updated.mimeType,
    sizeBytes: updated.sizeBytes,
    status: updated.status,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}

export function listDocumentsForVisitFromDb(
  deps: DocumentDeps,
  visitId: string,
): MfaDocumentRow[] {
  if (!deps.visitExists(visitId)) {
    throw domainError('VISIT_NOT_FOUND');
  }
  return deps.listDocumentsByVisitStmt.all(visitId) as MfaDocumentRow[];
}

export function requestDocumentPreviewInDb(deps: DocumentDeps, documentId: string): MfaDocumentRow {
  const document = requireDocumentByIdFromDb(deps, documentId);
  if (document.status === 'preview_requested' || document.status === 'export_requested') {
    return document;
  }
  if (!isDocumentPreviewable(document.source, document.status)) {
    throw domainError('INVALID_TRANSITION');
  }
  const updatedAt = deps.nowIso();
  applyDocumentStatusTransition(deps, {
    documentId,
    toStatus: 'preview_requested',
    updatedAt,
    eventType: 'DocumentPreviewRequested',
    eventPayload: {
      documentId,
      visitId: document.visitId,
      sessionId: document.sessionId,
      updatedAt,
    },
  });
  return requireDocumentByIdFromDb(deps, documentId);
}

export function discardDocumentByMfaInDb(deps: DocumentDeps, documentId: string): MfaDocumentRow {
  const document = requireDocumentByIdFromDb(deps, documentId);
  const allowedMfaDiscard = new Set<DocumentStatus>([
    'scan_clean',
    'blocked_malware',
    'scan_error',
    'received',
    'preview_requested',
    'export_requested',
  ]);
  if (!allowedMfaDiscard.has(document.status)) {
    throw domainError('INVALID_TRANSITION');
  }
  const updatedAt = deps.nowIso();
  applyDocumentStatusTransition(deps, {
    documentId,
    toStatus: 'discarded_by_mfa',
    updatedAt,
    eventType: 'DocumentLifecycleChanged',
    eventPayload: {
      documentId,
      visitId: document.visitId,
      sessionId: document.sessionId,
      fromStatus: document.status,
      toStatus: 'discarded_by_mfa',
      updatedAt,
    },
  });
  return requireDocumentByIdFromDb(deps, documentId);
}

export function discardDocumentAfterMalwareInDb(
  deps: DocumentDeps,
  documentId: string,
): MfaDocumentRow {
  const document = requireDocumentByIdFromDb(deps, documentId);
  if (document.status === 'discarded_by_mfa' || document.status === 'discarded_by_patient') {
    return document;
  }
  const allowedMalwareDiscard = new Set<DocumentStatus>([
    'scan_clean',
    'blocked_malware',
    'received',
    'preview_requested',
    'export_requested',
  ]);
  if (!allowedMalwareDiscard.has(document.status)) {
    throw domainError('INVALID_TRANSITION');
  }
  const updatedAt = deps.nowIso();
  applyDocumentStatusTransition(deps, {
    documentId,
    toStatus: 'discarded_by_mfa',
    updatedAt,
    eventType: 'DocumentLifecycleChanged',
    eventPayload: {
      documentId,
      visitId: document.visitId,
      sessionId: document.sessionId,
      fromStatus: document.status,
      toStatus: 'discarded_by_mfa',
      reason: 'blocked_malware',
      updatedAt,
    },
  });
  return requireDocumentByIdFromDb(deps, documentId);
}

export function requestDocumentExportInDb(deps: DocumentDeps, documentId: string): MfaDocumentRow {
  const document = requireDocumentByIdFromDb(deps, documentId);
  if (document.status !== 'preview_requested') {
    throw domainError('INVALID_TRANSITION');
  }
  const updatedAt = deps.nowIso();
  applyDocumentStatusTransition(deps, {
    documentId,
    toStatus: 'export_requested',
    updatedAt,
    eventType: 'DocumentLifecycleChanged',
    eventPayload: {
      documentId,
      visitId: document.visitId,
      sessionId: document.sessionId,
      fromStatus: document.status,
      toStatus: 'export_requested',
      updatedAt,
    },
  });
  return requireDocumentByIdFromDb(deps, documentId);
}

export function completeDocumentExportInDb(deps: DocumentDeps, documentId: string): MfaDocumentRow {
  const document = requireDocumentByIdFromDb(deps, documentId);
  if (document.status === 'exported') {
    return document;
  }
  if (document.status !== 'export_requested' && document.status !== 'preview_requested') {
    throw domainError('INVALID_TRANSITION');
  }
  const updatedAt = deps.nowIso();
  applyDocumentStatusTransition(deps, {
    documentId,
    toStatus: 'exported',
    updatedAt,
    eventType: 'DocumentLifecycleChanged',
    eventPayload: {
      documentId,
      visitId: document.visitId,
      sessionId: document.sessionId,
      fromStatus: document.status,
      toStatus: 'exported',
      updatedAt,
    },
  });
  return requireDocumentByIdFromDb(deps, documentId);
}

export function rollbackDocumentExportRequestInDb(
  deps: DocumentDeps,
  documentId: string,
): MfaDocumentRow {
  const document = requireDocumentByIdFromDb(deps, documentId);
  if (document.status !== 'export_requested') {
    return document;
  }

  const updatedAt = deps.nowIso();
  applyDocumentStatusTransition(deps, {
    documentId,
    toStatus: 'preview_requested',
    updatedAt,
    eventType: 'DocumentLifecycleChanged',
    eventPayload: {
      documentId,
      visitId: document.visitId,
      sessionId: document.sessionId,
      fromStatus: 'export_requested',
      toStatus: 'preview_requested',
      updatedAt,
    },
  });
  return requireDocumentByIdFromDb(deps, documentId);
}

export function renameDocumentFileNameInDb(
  deps: DocumentDeps,
  documentId: string,
  baseName: string,
): MfaDocumentRow {
  const document = requireDocumentByIdFromDb(deps, documentId);
  if (document.status !== 'preview_requested') {
    throw domainError('INVALID_TRANSITION');
  }

  let nextFileName: string;
  try {
    nextFileName = buildDocumentFileNameFromBase(document.fileName, baseName);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'INVALID_ARGUMENT';
    if (message === 'DOCUMENT_FILE_NAME_EMPTY' || message === 'DOCUMENT_FILE_NAME_TOO_LONG') {
      throw domainError('INVALID_ARGUMENT');
    }
    throw error;
  }

  if (nextFileName === document.fileName) {
    return document;
  }

  const updatedAt = deps.nowIso();
  deps.updateDocumentFileNameStmt.run(nextFileName, updatedAt, documentId);
  deps.emitOutboxEvent('DocumentRenamed', documentId, {
    documentId,
    visitId: document.visitId,
    sessionId: document.sessionId,
    fromFileName: document.fileName,
    toFileName: nextFileName,
    updatedAt,
  });
  return requireDocumentByIdFromDb(deps, documentId);
}
