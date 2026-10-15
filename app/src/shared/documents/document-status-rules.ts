import type { DocumentStatus } from '../db/db-types.js';

// Accepted documents remain visible until explicitly discarded or exported.
export const PENDING_DOCUMENT_STATUSES = [
  'received',
  'scanning',
  'scan_clean',
  'blocked_malware',
  'scan_error',
  'preview_requested',
  'export_requested',
] as const satisfies readonly DocumentStatus[];

const PREVIEWABLE_STATUSES = new Set<DocumentStatus>([
  'scan_clean',
  'preview_requested',
  'export_requested',
]);

export function isDocumentPreviewable(_source: unknown, status: DocumentStatus): boolean {
  return PREVIEWABLE_STATUSES.has(status);
}

export function mapSandboxIntakeScanStatus(
  scanStatus: 'clean' | 'blocked_malware' | 'scan_error',
): DocumentStatus {
  if (scanStatus === 'clean') {
    return 'scan_clean';
  }
  if (scanStatus === 'blocked_malware') {
    return 'blocked_malware';
  }
  return 'scan_error';
}

const PORTAL_LIST_DOCUMENT_STATUSES = new Set<DocumentStatus>([
  'scan_clean',
  'blocked_malware',
  'scan_error',
]);

export function isPortalListDocumentStatus(status: DocumentStatus): boolean {
  return PORTAL_LIST_DOCUMENT_STATUSES.has(status);
}
