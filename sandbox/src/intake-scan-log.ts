import type { FastifyBaseLogger } from 'fastify';
import type { IntakeDocumentResult } from './intake-document.js';

export function logIntakeScanOutcome(
  log: FastifyBaseLogger,
  result: Pick<
    IntakeDocumentResult,
    'documentId' | 'scanStatus' | 'sha256' | 'mimeType' | 'sizeBytes'
  >,
  source: 'intake' | 'form2pdf',
): void {
  if (result.scanStatus === 'clean') {
    return;
  }

  const meta = {
    documentId: result.documentId,
    scanStatus: result.scanStatus,
    sha256: result.sha256,
    mimeType: result.mimeType,
    sizeBytes: result.sizeBytes,
    source,
  };

  if (result.scanStatus === 'blocked_malware') {
    log.warn(meta, 'Sandbox intake blocked malware');
    return;
  }

  log.error(meta, 'Sandbox intake scan failed');
}
