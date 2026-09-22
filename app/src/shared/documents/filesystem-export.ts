import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import type { CoreDatabase, DocumentExportInfo } from '../db/database.js';
import { createModuleLogger } from '@praxis-flow/server-shared/logger';
import { getSandboxClient } from '../sandbox/sandbox-client.js';
import { purgeDocumentArtifacts } from './sandbox-document-cleanup.js';
import { DomainError, domainError } from '../errors/domain-error.js';

const log = createModuleLogger('documents.export');
const activeExportTargets = new Set<string>();

function sanitizePathSegment(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '_');
  const collapsed = normalized.replace(/_+/g, '_').replace(/^[_ .-]+|[_ .-]+$/g, '');
  return collapsed.length > 0 ? collapsed : 'unknown';
}

function buildWaitingNumber(prefix: string, number: number): string {
  return `${prefix}-${String(number).padStart(3, '0')}`;
}

export type DocumentExportPaths = {
  targetDir: string;
  targetFilePath: string;
  metadataPath: string;
};

export function resolveDocumentExportPaths(
  info: DocumentExportInfo,
  exportBasePath: string,
): DocumentExportPaths {
  const waitingNumber = buildWaitingNumber(info.ticketLaneCode, info.ticketNumber);
  const readableName = info.identityRef ? sanitizePathSegment(info.identityRef) : '';
  const folderName = readableName ? `${waitingNumber}_${readableName}` : waitingNumber;
  const targetDir = path.resolve(exportBasePath, folderName);
  const safeOriginalName = sanitizePathSegment(info.fileName);
  const targetFilePath = path.join(targetDir, `${info.documentId}_${safeOriginalName}`);
  const metadataPath = path.join(targetDir, `${info.documentId}.export-meta.json`);
  return { targetDir, targetFilePath, metadataPath };
}

async function exportArtifactsExist(paths: DocumentExportPaths): Promise<boolean> {
  try {
    await fs.access(paths.targetFilePath);
    await fs.access(paths.metadataPath);
    return true;
  } catch {
    return false;
  }
}

export class DocumentNotScannedError extends DomainError {
  constructor() {
    super('DOCUMENT_NOT_SCANNED');
    this.name = 'DocumentNotScannedError';
  }
}

async function writeExportStream(targetFilePath: string, source: Readable): Promise<void> {
  if (activeExportTargets.has(targetFilePath)) {
    throw domainError('INVALID_TRANSITION');
  }
  activeExportTargets.add(targetFilePath);

  const tempPrefix = `${path.basename(targetFilePath)}.`;
  const tempFilePath = `${targetFilePath}.${randomUUID()}.part`;
  let tempFile: Awaited<ReturnType<typeof fs.open>> | null = null;
  try {
    const entries = await fs.readdir(path.dirname(targetFilePath));
    await Promise.all(
      entries
        .filter((entry) => entry.startsWith(tempPrefix) && entry.endsWith('.part'))
        .map((entry) =>
          fs.unlink(path.join(path.dirname(targetFilePath), entry)).catch(() => null),
        ),
    );

    tempFile = await fs.open(tempFilePath, 'wx');
    await pipeline(source, tempFile.createWriteStream());
    await fs.rename(tempFilePath, targetFilePath);
  } finally {
    activeExportTargets.delete(targetFilePath);
    await tempFile?.close().catch(() => undefined);
    try {
      await fs.unlink(tempFilePath);
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
        log.warn(
          {
            filePath: tempFilePath,
            error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
          },
          'Failed to remove partial export file.',
        );
      }
    }
  }
}

async function streamSandboxSourceToExport(
  info: DocumentExportInfo,
  targetFilePath: string,
): Promise<void> {
  const sandbox = getSandboxClient();
  const response = await sandbox.getDocumentContent(info.documentId);
  if (response.status === 409) {
    throw domainError('EXPORT_BLOCKED_MALWARE');
  }
  if (!response.ok || !response.body) {
    throw new DocumentNotScannedError();
  }
  const { Readable } = await import('node:stream');
  const nodeStream = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream);
  await writeExportStream(targetFilePath, nodeStream);
}

async function removeExportPaths(paths: string[]): Promise<void> {
  for (const filePath of paths) {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        continue;
      }
      log.warn(
        {
          filePath,
          error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
        },
        'Failed to remove partial export file during rollback.',
      );
    }
  }
}

export async function exportDocumentToFilesystem(
  db: CoreDatabase,
  documentId: string,
): Promise<DocumentExportInfo> {
  const info = db.getDocumentExportInfo(documentId);
  if (info.status === 'exported') {
    return info;
  }
  if (info.status !== 'preview_requested' && info.status !== 'export_requested') {
    throw domainError('INVALID_TRANSITION');
  }

  const settings = db.getOpsSettings();
  const exportPaths = resolveDocumentExportPaths(info, settings.exportBasePath);

  if (info.status === 'export_requested' && (await exportArtifactsExist(exportPaths))) {
    await purgeDocumentArtifacts(documentId);
    return info;
  }

  await fs.mkdir(exportPaths.targetDir, { recursive: true });

  const { targetFilePath, metadataPath } = exportPaths;

  const writtenPaths: string[] = [];
  try {
    await streamSandboxSourceToExport(info, targetFilePath);
    writtenPaths.push(targetFilePath);

    const waitingNumber = buildWaitingNumber(info.ticketLaneCode, info.ticketNumber);
    const metadata = {
      documentId: info.documentId,
      visitId: info.visitId,
      waitingNumber,
      patientRef: info.identityRef,
      fileName: info.fileName,
      mimeType: info.mimeType,
      exportedFileName: path.basename(targetFilePath),
      exportedAt: new Date().toISOString(),
      exportBasePath: settings.exportBasePath,
      source: info.source,
      scanTrustedFromIntake: true,
    };
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
    writtenPaths.push(metadataPath);
  } catch (error) {
    await removeExportPaths(writtenPaths);
    throw error;
  }

  // Once both export artifacts exist, they are the durable copy. Sandbox deletion can
  // have succeeded even when its response is lost, so it must not trigger compensation.
  await purgeDocumentArtifacts(documentId);
  return info;
}
