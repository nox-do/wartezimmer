import type { FastifyInstance } from 'fastify';
import type { CoreDatabase } from '../../shared/db/database.js';
import type { ContactLookupValidateBody } from '../../api/ops-openapi-types.js';
import { opsSchemas } from '../../api/generated/ops.fastify-schemas.js';
import { parseCsvContactLookupMappingOrThrow } from '../../shared/contacts/contact-lookup-config.js';
import {
  previewContactLookupSettings,
  validateCsvContactLookupSettings,
} from '../../shared/contacts/contact-lookup-preview.js';
import { getDeploymentStorageSnapshot } from '../../shared/ops/deployment-storage.js';

function toContactLookupSettings(body: ContactLookupValidateBody) {
  return {
    folderPath: body.contactLookupFolderPath,
    delimiterMode: body.contactLookupDelimiterMode,
    hasHeader: body.contactLookupHasHeader,
    mapping: body.contactLookupMapping,
  };
}

export function registerOpsDeploymentRoutes(app: FastifyInstance, db: CoreDatabase): void {
  app.get(
    '/api/v1/ops/deployment/storage',
    {
      schema: {
        response: {
          200: opsSchemas.GET_api_v1_ops_deployment_storageResponse200,
        },
      },
    },
    async () => {
      return getDeploymentStorageSnapshot();
    },
  );

  app.post<{ Body: ContactLookupValidateBody }>(
    '/api/v1/ops/contact-lookup/preview',
    {
      schema: {
        body: opsSchemas.POST_api_v1_ops_contact_lookup_previewRequestBody,
        response: {
          200: opsSchemas.POST_api_v1_ops_contact_lookup_previewResponse200,
          400: opsSchemas.POST_api_v1_ops_contact_lookup_previewResponse400,
        },
      },
    },
    async (request, reply) => {
      let mapping;
      try {
        mapping = parseCsvContactLookupMappingOrThrow(request.body.contactLookupMapping);
      } catch {
        return reply.code(400).send({
          code: 'INVALID_ARGUMENT',
          message: 'CSV contact lookup mapping is invalid.',
        });
      }

      try {
        return await previewContactLookupSettings({
          ...toContactLookupSettings(request.body),
          mapping,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'CONTACT_LOOKUP_PREVIEW_FAILED';
        return reply.code(400).send({
          code: 'INVALID_ARGUMENT',
          message: message.startsWith('CONTACT_LOOKUP_')
            ? 'CSV contact lookup preview failed for the selected import folder.'
            : message,
        });
      }
    },
  );

  app.post<{ Body: ContactLookupValidateBody }>(
    '/api/v1/ops/contact-lookup/validate',
    {
      schema: {
        body: opsSchemas.POST_api_v1_ops_contact_lookup_validateRequestBody,
        response: {
          200: opsSchemas.POST_api_v1_ops_contact_lookup_validateResponse200,
          400: opsSchemas.POST_api_v1_ops_contact_lookup_validateResponse400,
        },
      },
    },
    async (request, reply) => {
      let mapping;
      try {
        mapping = parseCsvContactLookupMappingOrThrow(request.body.contactLookupMapping);
      } catch {
        return reply.code(400).send({
          code: 'INVALID_ARGUMENT',
          message: 'CSV contact lookup mapping is invalid.',
        });
      }

      try {
        const result = await validateCsvContactLookupSettings({
          ...toContactLookupSettings(request.body),
          mapping,
        });
        return {
          ok: true,
          detectedDelimiterMode: result.detectedDelimiterMode,
          layout: result.layout,
          csvFileCount: result.csvFileCount,
          patientCount: result.patientCount,
          sampleRows: result.sampleRows,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'CONTACT_LOOKUP_VALIDATION_FAILED';
        return reply.code(400).send({
          code: 'INVALID_ARGUMENT',
          message: message.startsWith('CONTACT_LOOKUP_')
            ? 'CSV contact lookup settings are invalid or import folder is not readable with the selected mapping.'
            : message,
        });
      }
    },
  );

  app.post(
    '/api/v1/ops/contact-lookup/apply-demo',
    {
      schema: {
        response: {
          200: opsSchemas.POST_api_v1_ops_contact_lookup_apply_demoResponse200,
        },
      },
    },
    async () => {
      db.applySetupContactSample();
      return db.verifySetupStatus();
    },
  );
}
