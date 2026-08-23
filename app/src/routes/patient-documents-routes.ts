import { randomUUID } from 'node:crypto';
import type { FastifyInstance, RouteShorthandOptions } from 'fastify';
import { buildFormPrivacyNoticeV2 } from '../shared/forms/consent/privacy-notice-v1.js';
import { getPracticeProfileForDb } from '../shared/practice/practice-profile-service.js';
import { FORM_PORTAL_CONTROLS } from '../shared/forms/portal-field-metadata.js';
import {
  getFormTemplate,
  listPortalFormTemplateDescriptors,
  toPortalFormTemplate,
} from '../shared/forms/template-registry.js';
import type { CoreDatabase } from '../shared/db/database.js';
import {
  mapSandboxIntakeScanStatus,
  isPortalListDocumentStatus,
} from '../shared/documents/document-status-rules.js';
import {
  intakePatientFormDocuments,
  normalizeFormTemplateId,
  type PatientFormDocumentItem,
} from '../shared/documents/form-document-intake.js';
import { sendResolvedDomainError } from '../http/domain-error-mapper.js';
import { PATIENT_UPLOAD_MAX_BYTES } from '../shared/documents/patient-upload-limits.js';
import { normalizePatientUploadFileName } from '@praxis-flow/server-shared';
import {
  purgeDocumentArtifacts,
  purgeSandboxDocumentBestEffort,
} from '../shared/documents/sandbox-document-cleanup.js';
import { errorResponseSchema } from '../http/schemas.js';
import { publishTvQueueUpdate } from '../shared/queue/queue-stream-hub.js';
import { getSandboxClient } from '../shared/sandbox/sandbox-client.js';
import { isRecord } from '../shared/type-guards.js';
import {
  createRequirePatientSessionPreHandler,
  getPatientSessionToken,
  isSessionUnauthorizedError,
  sendSessionUnauthorized,
} from './session-auth.js';
import { createRequirePortalEnabledPreHandler } from './portal-access.js';

const patientDocumentSchema = {
  type: 'object',
  required: [
    'id',
    'visitId',
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
    fileName: { type: 'string' },
    mimeType: { type: 'string' },
    sizeBytes: { type: 'integer' },
    status: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
} as const;

function isMultipartIntake(contentType: string | undefined): boolean {
  return (contentType ?? '').toLowerCase().includes('multipart/form-data');
}

const PATIENT_DOCUMENT_ERROR_MESSAGES = {
  byApiCode: {
    SANDBOX_UNAVAILABLE: 'Form PDF rendering is currently unavailable.',
    INVALID_TRANSITION: 'Document cannot be deleted in current status.',
  },
  byDomainCode: {
    SANDBOX_DELETE_UNREACHABLE: 'Document could not be removed from intake storage.',
  },
} as const;

export function registerPatientDocumentRoutes(app: FastifyInstance, db: CoreDatabase): void {
  const requirePatientSession = createRequirePatientSessionPreHandler(db);
  const requirePortalEnabled = createRequirePortalEnabledPreHandler(db);

  function withPatientSession(options: RouteShorthandOptions = {}): RouteShorthandOptions {
    return { ...options, preHandler: [requirePortalEnabled, requirePatientSession] };
  }

  app.get(
    '/api/v1/patient-documents/form-templates',
    withPatientSession({
      schema: {
        response: {
          200: {
            type: 'object',
            required: ['items'],
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['id', 'name', 'version'],
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    version: { type: 'integer' },
                  },
                },
              },
            },
          },
          401: errorResponseSchema,
        },
      },
    }),
    async () => ({ items: listPortalFormTemplateDescriptors() }),
  );

  app.get<{ Params: { templateId: string }; Querystring: { version?: string } }>(
    '/api/v1/patient-documents/form-templates/:templateId',
    withPatientSession({
      schema: {
        params: {
          type: 'object',
          required: ['templateId'],
          additionalProperties: false,
          properties: {
            templateId: { type: 'string', minLength: 1 },
          },
        },
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            version: { type: 'string', pattern: '^[1-9][0-9]*$' },
          },
        },
        response: {
          200: {
            type: 'object',
            required: ['id', 'name', 'version', 'fields', 'sections'],
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              version: { type: 'integer' },
              sections: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['titleKey', 'fieldIds'],
                  properties: {
                    titleKey: { type: 'string' },
                    fieldIds: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                },
              },
              fields: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['id', 'label', 'type', 'required', 'portalControl'],
                  properties: {
                    id: { type: 'string' },
                    label: { type: 'string' },
                    type: { type: 'string' },
                    required: { type: 'boolean' },
                    maxLength: { type: 'integer' },
                    portalControl: { type: 'string', enum: [...FORM_PORTAL_CONTROLS] },
                    min: { type: 'number' },
                    max: { type: 'number' },
                    step: { type: 'number' },
                    hideInPortalForm: { type: 'boolean' },
                    hideWhenCheckinPhone: { type: 'boolean' },
                  },
                },
              },
            },
          },
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    }),
    async (request, reply) => {
      const requestedVersionRaw = request.query.version?.trim();
      const hasRequestedVersion = Boolean(requestedVersionRaw && requestedVersionRaw.length > 0);
      const requestedVersion = hasRequestedVersion
        ? Number.parseInt(requestedVersionRaw ?? '', 10)
        : undefined;
      if (
        hasRequestedVersion &&
        (!Number.isSafeInteger(requestedVersion) || (requestedVersion ?? 0) < 1)
      ) {
        return reply.code(400).send({
          code: 'INVALID_ARGUMENT',
          message: 'version must be a positive integer.',
        });
      }
      const normalizedTemplateId = normalizeFormTemplateId(request.params.templateId);
      if (!normalizedTemplateId) {
        return reply.code(400).send({
          code: 'INVALID_ARGUMENT',
          message: 'templateId must not be empty.',
        });
      }

      const template = getFormTemplate(normalizedTemplateId, requestedVersion);
      if (!template) {
        return reply.code(404).send({
          code: 'FORM_TEMPLATE_NOT_FOUND',
          message: 'Form template not found.',
        });
      }

      return toPortalFormTemplate(template);
    },
  );

  app.get(
    '/api/v1/patient-documents/privacy-notice',
    withPatientSession({
      schema: {
        response: {
          200: {
            type: 'object',
            required: ['version', 'title', 'paragraphs'],
            properties: {
              version: { type: 'string' },
              title: { type: 'string' },
              paragraphs: {
                type: 'array',
                items: { type: 'string' },
              },
            },
          },
          401: errorResponseSchema,
        },
      },
    }),
    async () => buildFormPrivacyNoticeV2(getPracticeProfileForDb(db)),
  );

  app.post<{ Body: { items?: PatientFormDocumentItem[] } }>(
    '/api/v1/patient-documents/forms',
    withPatientSession({
      schema: {
        body: {
          type: 'object',
          required: ['items'],
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              minItems: 1,
              maxItems: 8,
              items: {
                type: 'object',
                required: ['templateId', 'templateVersion'],
                additionalProperties: false,
                properties: {
                  templateId: { type: 'string', minLength: 1, maxLength: 120 },
                  templateVersion: { type: 'integer', minimum: 1 },
                  answers: { type: 'object', additionalProperties: true, maxProperties: 64 },
                },
              },
            },
          },
        },
        response: {
          201: {
            type: 'object',
            required: ['items'],
            properties: {
              items: {
                type: 'array',
                items: patientDocumentSchema,
              },
            },
          },
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
          502: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    }),
    async (request, reply) => {
      const token = getPatientSessionToken(request);
      const rawItems = request.body.items ?? [];
      if (!Array.isArray(rawItems)) {
        return reply
          .code(400)
          .send({ code: 'INVALID_ARGUMENT', message: 'items must be an array.' });
      }

      const items: PatientFormDocumentItem[] = [];
      for (const raw of rawItems) {
        if (!raw || typeof raw !== 'object') {
          return reply
            .code(400)
            .send({ code: 'INVALID_ARGUMENT', message: 'Each form item must be an object.' });
        }
        const record = raw as Record<string, unknown>;
        const templateId = record.templateId;
        const templateVersion = record.templateVersion;
        if (typeof templateId !== 'string' || !templateId.trim()) {
          return reply
            .code(400)
            .send({ code: 'INVALID_ARGUMENT', message: 'templateId must be a non-empty string.' });
        }
        if (typeof templateVersion !== 'string' && typeof templateVersion !== 'number') {
          return reply.code(400).send({
            code: 'INVALID_ARGUMENT',
            message: 'templateVersion must be a string or number.',
          });
        }
        const parsedTemplateVersion =
          typeof templateVersion === 'number'
            ? templateVersion
            : Number.parseInt(String(templateVersion).trim(), 10);
        if (!Number.isInteger(parsedTemplateVersion) || parsedTemplateVersion < 1) {
          return reply.code(400).send({
            code: 'INVALID_ARGUMENT',
            message: 'templateVersion must be a positive integer.',
          });
        }
        const answers = record.answers;
        if (answers != null && !isRecord(answers)) {
          return reply
            .code(400)
            .send({ code: 'INVALID_ARGUMENT', message: 'answers must be an object.' });
        }
        items.push({
          templateId: templateId.trim(),
          templateVersion: parsedTemplateVersion,
          answers: answers ?? undefined,
        });
      }

      try {
        const created = await intakePatientFormDocuments(db, token, items);
        db.submitPatientSession(token);
        publishTvQueueUpdate(db);
        return reply.code(201).send({ items: created });
      } catch (error) {
        if (isSessionUnauthorizedError(error)) {
          sendSessionUnauthorized(reply);
          return;
        }
        if (sendResolvedDomainError(reply, error, PATIENT_DOCUMENT_ERROR_MESSAGES)) {
          return;
        }
        throw error;
      }
    },
  );

  app.post(
    '/api/v1/patient-documents/intake',
    withPatientSession({
      schema: {
        response: {
          201: patientDocumentSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          502: errorResponseSchema,
        },
      },
    }),
    async (request, reply) => {
      const token = getPatientSessionToken(request);

      if (!isMultipartIntake(request.headers['content-type'])) {
        return reply.code(400).send({
          code: 'INVALID_ARGUMENT',
          message: 'Expected multipart/form-data with a file field.',
        });
      }

      const part = await request.file();
      if (!part) {
        return reply.code(400).send({
          code: 'INVALID_ARGUMENT',
          message: 'Missing file upload.',
        });
      }

      const buffer = await part.toBuffer();
      const fileName = normalizePatientUploadFileName(part.filename?.trim() || 'upload.bin');
      const mimeType = part.mimetype?.trim() || 'application/octet-stream';

      if (buffer.length < 1 || buffer.length > PATIENT_UPLOAD_MAX_BYTES) {
        return reply.code(400).send({
          code: 'INVALID_ARGUMENT',
          message: 'File size is invalid.',
        });
      }

      const documentId = randomUUID();
      const sandbox = getSandboxClient();
      let intake;
      try {
        intake = await sandbox.putDocumentIntake(documentId, buffer, { fileName, mimeType });
      } catch (error) {
        if (
          sendResolvedDomainError(reply, error, {
            byApiCode: { SANDBOX_UNAVAILABLE: 'Document intake service is currently unavailable.' },
          })
        ) {
          return;
        }
        throw error;
      }

      const status = mapSandboxIntakeScanStatus(intake.scanStatus);

      try {
        const created = db.intakePatientDocument(token, {
          documentId,
          fileName,
          mimeType,
          sizeBytes: intake.sizeBytes,
          status,
        });
        publishTvQueueUpdate(db);
        return reply.code(201).send(created);
      } catch (error) {
        await purgeSandboxDocumentBestEffort(documentId);
        if (isSessionUnauthorizedError(error)) {
          sendSessionUnauthorized(reply);
          return;
        }
        throw error;
      }
    },
  );

  app.get(
    '/api/v1/patient-documents',
    withPatientSession({
      schema: {
        response: {
          200: {
            type: 'object',
            required: ['items', 'uploadMaxBytes'],
            properties: {
              uploadMaxBytes: { type: 'integer' },
              items: {
                type: 'array',
                items: patientDocumentSchema,
              },
            },
          },
          401: errorResponseSchema,
        },
      },
    }),
    async (request, reply) => {
      const token = getPatientSessionToken(request);
      try {
        const items = db
          .listPatientDocuments(token)
          .filter((doc) => isPortalListDocumentStatus(doc.status));
        return { items, uploadMaxBytes: PATIENT_UPLOAD_MAX_BYTES };
      } catch (error) {
        if (isSessionUnauthorizedError(error)) {
          sendSessionUnauthorized(reply);
          return;
        }
        throw error;
      }
    },
  );

  app.post<{ Params: { documentId: string } }>(
    '/api/v1/patient-documents/:documentId/delete',
    withPatientSession({
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
          200: patientDocumentSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    }),
    async (request, reply) => {
      const token = getPatientSessionToken(request);
      try {
        const documentId = request.params.documentId.trim();
        await purgeDocumentArtifacts(documentId);
        const discarded = db.discardPatientDocument(token, documentId);
        publishTvQueueUpdate(db);
        return discarded;
      } catch (error) {
        if (isSessionUnauthorizedError(error)) {
          sendSessionUnauthorized(reply);
          return;
        }
        if (sendResolvedDomainError(reply, error, PATIENT_DOCUMENT_ERROR_MESSAGES)) {
          return;
        }
        throw error;
      }
    },
  );
}
