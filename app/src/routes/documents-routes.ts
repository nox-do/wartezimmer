import type { FastifyInstance } from 'fastify';
import type { CoreDatabase } from '../shared/db/database.js';
import { exportDocumentToFilesystem } from '../shared/documents/filesystem-export.js';
import { buildSecuredEmbedUrl } from '../shared/documents/preview-embed-access.js';
import {
  purgeDocumentArtifacts,
  purgeSandboxPreviewSessionBestEffort,
} from '../shared/documents/sandbox-document-cleanup.js';
import { errorResponseSchema } from '../http/schemas.js';
import { getSandboxClient } from '../shared/sandbox/sandbox-client.js';
import { readDomainCode, sendResolvedDomainError } from '../http/domain-error-mapper.js';
import { publishTvQueueUpdate } from '../shared/queue/queue-stream-hub.js';

const mfaDocumentSchema = {
  type: 'object',
  required: [
    'id',
    'visitId',
    'sessionId',
    'source',
    'fileName',
    'mimeType',
    'sizeBytes',
    'status',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: { type: 'string' },
    visitId: { type: 'string' },
    sessionId: { type: 'string' },
    source: { type: 'string', enum: ['upload', 'form'] },
    fileName: { type: 'string' },
    mimeType: { type: 'string' },
    sizeBytes: { type: 'integer' },
    status: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
} as const;

const mfaPreviewResponseSchema = {
  ...mfaDocumentSchema,
  required: [...mfaDocumentSchema.required, 'preview'],
  properties: {
    ...mfaDocumentSchema.properties,
    preview: {
      type: 'object',
      required: ['previewSessionId', 'documentId', 'status', 'updatedAt'],
      properties: {
        previewSessionId: { type: 'string' },
        documentId: { type: 'string' },
        status: { type: 'string' },
        previewMode: { type: 'string' },
        embedUrl: { type: 'string' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  },
} as const;

const DOCUMENT_ROUTE_MESSAGES = {
  byApiCode: {
    INVALID_TRANSITION: 'Document transition is not allowed.',
    DOCUMENT_NOT_SCANNED: 'Document export requires a successful intake scan and sandbox artifact.',
    EXPORT_BLOCKED_MALWARE: 'Document export is blocked because malware was detected.',
    SANDBOX_UNAVAILABLE: 'Preview service is currently unavailable.',
  },
  byDomainCode: {
    SANDBOX_DELETE_UNREACHABLE: 'Sandbox cleanup failed — export or discard was not completed.',
  },
} as const;

function withSecuredEmbedUrl<
  T extends { previewSessionId: string; documentId: string; embedUrl?: string; status: string },
>(preview: T): T {
  if (preview.status !== 'ready' || !preview.embedUrl) {
    return preview;
  }
  return {
    ...preview,
    embedUrl: buildSecuredEmbedUrl(preview.previewSessionId, preview.documentId, preview.embedUrl),
  };
}

export function registerDocumentRoutes(app: FastifyInstance, db: CoreDatabase): void {
  app.get<{ Params: { visitId: string } }>(
    '/api/v1/documents/:visitId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['visitId'],
          additionalProperties: false,
          properties: {
            visitId: { type: 'string', minLength: 1 },
          },
        },
        response: {
          200: {
            type: 'object',
            required: ['items'],
            properties: {
              items: { type: 'array', items: mfaDocumentSchema },
            },
          },
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const visitId = request.params.visitId.trim();
      try {
        return { items: db.listDocumentsForTicket(visitId) };
      } catch (error) {
        if (
          sendResolvedDomainError(reply, error, {
            byApiCode: { TICKET_NOT_FOUND: `Ticket ${visitId} wurde nicht gefunden.` },
          })
        ) {
          return;
        }
        throw error;
      }
    },
  );

  app.post<{ Params: { documentId: string } }>(
    '/api/v1/documents/:documentId/preview',
    {
      schema: {
        params: {
          type: 'object',
          required: ['documentId'],
          additionalProperties: false,
          properties: {
            documentId: { type: 'string', minLength: 1 },
          },
        },
        response: {
          200: mfaPreviewResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
          502: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const documentId = request.params.documentId.trim();
        const current = db.getDocumentForPreviewRequest(documentId);
        const sandbox = getSandboxClient();
        const previewInput = {
          previewSessionId: current.sessionId,
          documentId: current.id,
          mimeType: current.mimeType,
        };
        const preview = await sandbox.ensurePreviewSessionDocument(previewInput, {
          allowCached:
            current.status === 'preview_requested' || current.status === 'export_requested',
        });

        if (preview.status === 'blocked_malware') {
          await purgeDocumentArtifacts(documentId);
          const purged = db.discardDocumentAfterMalware(documentId);
          publishTvQueueUpdate(db);
          return {
            ...purged,
            preview,
          };
        }

        let updated;
        try {
          updated = db.requestDocumentPreview(documentId);
        } catch (error) {
          if (readDomainCode(error) === 'INVALID_TRANSITION') {
            const latest = db.getDocumentById(documentId);
            if (latest.status === 'preview_requested' || latest.status === 'export_requested') {
              updated = latest;
            } else {
              await purgeSandboxPreviewSessionBestEffort(current.sessionId);
              throw error;
            }
          } else {
            throw error;
          }
        }
        return {
          ...updated,
          preview: withSecuredEmbedUrl(preview),
        };
      } catch (error) {
        if (sendResolvedDomainError(reply, error, DOCUMENT_ROUTE_MESSAGES)) {
          return;
        }
        throw error;
      }
    },
  );

  app.post<{ Params: { documentId: string }; Body: { baseName?: string } }>(
    '/api/v1/documents/:documentId/rename',
    {
      schema: {
        params: {
          type: 'object',
          required: ['documentId'],
          additionalProperties: false,
          properties: {
            documentId: { type: 'string', minLength: 1 },
          },
        },
        body: {
          type: 'object',
          required: ['baseName'],
          additionalProperties: false,
          properties: {
            baseName: { type: 'string', minLength: 1, maxLength: 240 },
          },
        },
        response: {
          200: mfaDocumentSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const documentId = request.params.documentId.trim();
      const baseName = request.body.baseName?.trim() ?? '';
      if (!baseName) {
        return reply.code(400).send({
          code: 'INVALID_ARGUMENT',
          message: 'Dateiname darf nicht leer sein.',
        });
      }

      try {
        return db.renameDocumentFileName(documentId, baseName);
      } catch (error) {
        if (sendResolvedDomainError(reply, error, DOCUMENT_ROUTE_MESSAGES)) {
          return;
        }
        throw error;
      }
    },
  );

  app.post<{ Params: { documentId: string } }>(
    '/api/v1/documents/:documentId/discard',
    {
      schema: {
        params: {
          type: 'object',
          required: ['documentId'],
          additionalProperties: false,
          properties: {
            documentId: { type: 'string', minLength: 1 },
          },
        },
        response: {
          200: mfaDocumentSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
          502: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const documentId = request.params.documentId.trim();
      try {
        await purgeDocumentArtifacts(documentId);
        const discarded = db.discardDocumentByMfa(documentId);
        publishTvQueueUpdate(db);
        return discarded;
      } catch (error) {
        if (sendResolvedDomainError(reply, error, DOCUMENT_ROUTE_MESSAGES)) {
          return;
        }
        throw error;
      }
    },
  );

  app.post<{ Params: { documentId: string } }>(
    '/api/v1/documents/:documentId/export-filesystem',
    {
      schema: {
        params: {
          type: 'object',
          required: ['documentId'],
          additionalProperties: false,
          properties: {
            documentId: { type: 'string', minLength: 1 },
          },
        },
        response: {
          200: mfaDocumentSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const documentId = request.params.documentId.trim();
      try {
        const current = db.getDocumentById(documentId);
        if (current.status !== 'preview_requested' && current.status !== 'export_requested') {
          return reply.code(409).send({
            code: 'INVALID_TRANSITION',
            message: 'Document transition is not allowed.',
          });
        }

        if (current.status === 'preview_requested') {
          db.requestDocumentExport(documentId);
        }

        let exportPhaseComplete = false;
        try {
          await exportDocumentToFilesystem(db, documentId);
          exportPhaseComplete = true;
          const exported = db.completeDocumentExport(documentId);
          publishTvQueueUpdate(db);
          return exported;
        } catch (exportError) {
          if (!exportPhaseComplete) {
            db.rollbackDocumentExportRequest(documentId);
          }
          throw exportError;
        }
      } catch (error) {
        if (sendResolvedDomainError(reply, error, DOCUMENT_ROUTE_MESSAGES)) {
          return;
        }
        throw error;
      }
    },
  );
}
