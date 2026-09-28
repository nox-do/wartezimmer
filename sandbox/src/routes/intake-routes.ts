import type { PreviewStore } from '../preview-store.js';
import type { FastifyInstance } from 'fastify';
import type { SandboxConfig } from '../sandbox-config.js';
import {
  decodeIntakeFileNameHeader,
  INTAKE_FILE_NAME_ENCODING_HEADER,
} from '@praxis-flow/server-shared';
import { processIntakeDocument } from '../intake-document.js';
import { IntakeStore, SANDBOX_INTAKE_MAX_BYTES } from '../intake-store.js';
import type { ScannerService } from '../scanner-service.js';
import { buildInlineContentDisposition } from '../content-disposition-inline.js';
import { logIntakeScanOutcome } from '../intake-scan-log.js';

function readHeaderString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? '';
  }
  return value?.trim() ?? '';
}

export function registerIntakeRoutes(
  app: FastifyInstance,
  config: Pick<SandboxConfig, 'intakeBasePath'>,
  scanner: ScannerService,
  previews?: PreviewStore,
): void {
  const intakeStore = new IntakeStore(config.intakeBasePath);

  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit: SANDBOX_INTAKE_MAX_BYTES },
    (_request, payload, done) => {
      done(null, payload);
    },
  );

  app.put<{ Params: { documentId: string }; Body: Buffer }>(
    '/internal/documents/:documentId/intake',
    async (request, reply) => {
      const documentId = request.params.documentId.trim();
      const fileName = decodeIntakeFileNameHeader(
        readHeaderString(request.headers['x-file-name']),
        readHeaderString(request.headers[INTAKE_FILE_NAME_ENCODING_HEADER]),
      );
      const mimeType =
        readHeaderString(request.headers['x-mime-type']) || 'application/octet-stream';

      if (!documentId) {
        return reply.code(400).send({
          code: 'SANDBOX_INVALID_ARGUMENT',
          message: 'documentId is required.',
        });
      }

      const existing = await intakeStore.readRecord(documentId);
      if (existing) {
        return reply.code(409).send({
          code: 'SANDBOX_INTAKE_EXISTS',
          message: 'Document intake already exists.',
        });
      }

      const bodyBuffer = request.body;
      if (!Buffer.isBuffer(bodyBuffer) || bodyBuffer.length < 1) {
        return reply.code(400).send({
          code: 'SANDBOX_INTAKE_INVALID_BODY',
          message: 'Request body is required.',
        });
      }

      try {
        const result = await processIntakeDocument(intakeStore, scanner, {
          documentId,
          fileName,
          mimeType,
          buffer: bodyBuffer,
        });
        logIntakeScanOutcome(request.log, result, 'intake');
        return {
          documentId: result.documentId,
          scanStatus: result.scanStatus,
          sha256: result.sha256,
          sizeBytes: result.sizeBytes,
          scannedAt: result.scannedAt,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
        if (
          message === 'SANDBOX_INTAKE_MIME_NOT_ALLOWED' ||
          message === 'SANDBOX_INTAKE_INVALID_SIZE'
        ) {
          return reply.code(400).send({
            code: 'SANDBOX_INVALID_ARGUMENT',
            message: 'File type or size is not allowed.',
          });
        }
        if (message.includes('EEXIST')) {
          return reply.code(409).send({
            code: 'SANDBOX_INTAKE_EXISTS',
            message: 'Document intake already exists.',
          });
        }
        throw error;
      }
    },
  );

  app.get<{ Params: { documentId: string } }>(
    '/internal/documents/:documentId/content',
    async (request, reply) => {
      const documentId = request.params.documentId.trim();
      const record = await intakeStore.readRecord(documentId);
      if (!record) {
        return reply.code(404).send({
          code: 'SANDBOX_INTAKE_NOT_FOUND',
          message: 'Document intake not found.',
        });
      }
      if (record.scanStatus === 'blocked_malware') {
        return reply.code(409).send({
          code: 'SANDBOX_INTAKE_BLOCKED',
          message: 'Document is blocked.',
        });
      }
      if (record.scanStatus !== 'clean') {
        return reply.code(409).send({
          code: 'SANDBOX_INTAKE_NOT_READY',
          message: 'Document is not available.',
        });
      }

      return reply
        .header('Content-Disposition', buildInlineContentDisposition(record.fileName))
        .type(record.mimeType)
        .send(intakeStore.createReadStreamForRecord(record));
    },
  );

  app.delete<{ Params: { documentId: string } }>(
    '/internal/documents/:documentId',
    async (request, reply) => {
      const documentId = request.params.documentId.trim();
      if (!documentId) {
        return reply.code(400).send({
          code: 'SANDBOX_INVALID_ARGUMENT',
          message: 'documentId is required.',
        });
      }
      await intakeStore.deleteDocument(documentId);
      previews?.deleteDocument(documentId);
      return reply.code(204).send();
    },
  );

  app.post<{ Body: { reason?: string } }>(
    '/internal/documents/purge-day',
    async (request, reply) => {
      const removed = await intakeStore.purgeAll();
      previews?.clear();
      const purgedAt = new Date().toISOString();
      request.log.warn(
        {
          removed,
          purgedAt,
          reason: request.body?.reason?.trim() || undefined,
        },
        'Sandbox intake purge-day completed',
      );
      return reply.code(200).send({ removed, purgedAt });
    },
  );
}
