import type { IntakeRecord, IntakeScanStatus } from './intake-store.js';
import { IntakeStore } from './intake-store.js';
import type { ScannerService } from './scanner-service.js';

export type IntakeDocumentResult = {
  documentId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  scanStatus: IntakeScanStatus;
  scannedAt: string;
};

export async function processIntakeDocument(
  intakeStore: IntakeStore,
  scanner: ScannerService,
  input: {
    documentId: string;
    fileName: string;
    mimeType: string;
    buffer: Buffer;
  },
): Promise<IntakeDocumentResult> {
  const { sourcePath, sha256 } = await intakeStore.writeFromBuffer(
    input.documentId,
    input.fileName,
    input.mimeType,
    input.buffer,
  );

  const scan = await scanner.scanDocumentAtPath(sourcePath);
  const scanStatus: IntakeScanStatus =
    scan.status === 'clean'
      ? 'clean'
      : scan.status === 'blocked_malware'
        ? 'blocked_malware'
        : 'scan_error';

  const record: IntakeRecord = {
    documentId: input.documentId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.buffer.length,
    sha256,
    scanStatus,
    scannedAt: scan.scannedAt,
    sourcePath,
  };
  await intakeStore.saveRecord(record);

  return {
    documentId: input.documentId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.buffer.length,
    sha256,
    scanStatus,
    scannedAt: scan.scannedAt,
  };
}
