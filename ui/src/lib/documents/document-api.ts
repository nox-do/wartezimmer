import { cookieAuthFetch } from '$lib/api/cookie-auth-fetch';
import type { MfaDocument, MfaDocumentListResponse, MfaDocumentPreview } from './types';

function documentPath(documentId: string, action?: string): string {
  const basePath = `/api/v1/documents/${encodeURIComponent(documentId)}`;
  return action ? `${basePath}/${action}` : basePath;
}

function postDocumentAction<T>(documentId: string, action: string, body: object = {}) {
  return cookieAuthFetch<T>(documentPath(documentId, action), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function fetchDocumentsForVisit(visitId: string) {
  return cookieAuthFetch<MfaDocumentListResponse>(
    `/api/v1/documents/${encodeURIComponent(visitId)}`,
  );
}

export async function previewDocument(documentId: string) {
  return postDocumentAction<MfaDocumentPreview>(documentId, 'preview');
}

export async function discardDocument(documentId: string) {
  return postDocumentAction<MfaDocument>(documentId, 'discard');
}

export async function renameDocument(documentId: string, baseName: string) {
  return postDocumentAction<MfaDocument>(documentId, 'rename', { baseName });
}

export async function exportDocument(documentId: string) {
  return postDocumentAction<MfaDocument>(documentId, 'export-filesystem');
}
