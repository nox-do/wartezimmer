import type { FastifyInstance } from 'fastify';
import type { CoreDatabase } from '../../shared/db/database.js';
import type { PatchOpsOnboardingBody, PatchOpsSettingsBody } from '../../api/ops-openapi-types.js';
import { opsSchemas } from '../../api/generated/ops.fastify-schemas.js';
import { sendDomainError, resolveDomainError } from '../../http/domain-error-mapper.js';
import {
  opsSettingsInvalidHttpStatus,
  opsSettingsInvalidResponse,
} from '../../shared/db/ops-settings-errors.js';
import { invalidateContactLookupCache } from '../../shared/contacts/contact-lookup-cache.js';
import { assertPatchOpsSettingsAllowedForRole } from './ops-settings-patch-by-role.js';
import { buildOpsSettingsUpdate, toOpsSettingsResponse } from './ops-settings-mapper.js';
import type { StaffSessionManager } from '../../auth/staff-session-auth.js';
import { publishTvQueueUpdate } from '../../shared/queue/queue-stream-hub.js';
import { applyRoomPanelSettingsEffects } from './room-panel-settings-effects.js';

export function createSerializedExecutor() {
  let tail = Promise.resolve();
  return function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(operation, operation);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}

export function registerOpsSettingsRoutes(
  app: FastifyInstance,
  db: CoreDatabase,
  sessions: StaffSessionManager,
): void {
  const serializeSettingsUpdate = createSerializedExecutor();

  app.get(
    '/api/v1/ops/settings/onboarding',
    {
      schema: {
        response: {
          200: opsSchemas.GET_api_v1_ops_settings_onboardingResponse200,
        },
      },
    },
    async () => db.getSetupStatus(),
  );

  app.post(
    '/api/v1/ops/settings/onboarding/verify',
    {
      schema: {
        response: {
          200: opsSchemas.POST_api_v1_ops_settings_onboarding_verifyResponse200,
          403: opsSchemas.POST_api_v1_ops_settings_onboarding_verifyResponse403,
        },
      },
    },
    async (request, reply) => {
      if (request.clientRole !== 'ops') {
        return reply.code(403).send({
          code: 'AUTH_FORBIDDEN',
          message: 'Onboarding verify is only available for the ops role.',
        });
      }
      return db.verifySetupStatus();
    },
  );

  app.patch<{ Body: PatchOpsOnboardingBody }>(
    '/api/v1/ops/settings/onboarding',
    {
      schema: {
        body: opsSchemas.PATCH_api_v1_ops_settings_onboardingRequestBody,
        response: {
          200: opsSchemas.PATCH_api_v1_ops_settings_onboardingResponse200,
          400: opsSchemas.PATCH_api_v1_ops_settings_onboardingResponse400,
          403: opsSchemas.PATCH_api_v1_ops_settings_onboardingResponse403,
          409: opsSchemas.PATCH_api_v1_ops_settings_onboardingResponse409,
        },
      },
    },
    async (request, reply) => {
      if (request.clientRole !== 'ops') {
        return reply.code(403).send({
          code: 'AUTH_FORBIDDEN',
          message: 'Onboarding is only available for the ops role.',
        });
      }

      const body = request.body;

      if (body.completeOnboarding) {
        try {
          await db.completeSetup();
        } catch (error) {
          const resolved = resolveDomainError(error);
          if (resolved?.rawMessage === 'SETUP_REQUIRED_CHECKS_INCOMPLETE') {
            const onboarding = await db.verifySetupStatus();
            sendDomainError(reply, error, {
              details: { checks: onboarding.checks.filter((check) => check.required && !check.ok) },
            });
            return;
          }
          if (sendDomainError(reply, error)) {
            return;
          }
          throw error;
        }
        return db.verifySetupStatus();
      }

      if (body.reopenOnboarding) {
        await db.reopenSetup();
        return db.getSetupStatus();
      }

      if (
        body.setupLastStep !== undefined ||
        body.portalEnabled !== undefined ||
        body.setupContactMode !== undefined
      ) {
        db.updateSetupProgress({
          lastStep: body.setupLastStep,
          portalEnabled: body.portalEnabled,
          contactMode: body.setupContactMode,
        });
      }

      return db.getSetupStatus();
    },
  );

  app.get(
    '/api/v1/ops/settings/capabilities',
    {
      schema: {
        response: {
          200: opsSchemas.GET_api_v1_ops_settings_capabilitiesResponse200,
        },
      },
    },
    async () => db.getRoutingCapabilities(),
  );

  app.get(
    '/api/v1/ops/settings',
    {
      schema: {
        response: {
          200: opsSchemas.GET_api_v1_ops_settingsResponse200,
        },
      },
    },
    async () => toOpsSettingsResponse(db.getOpsSettings()),
  );

  app.patch<{ Body: PatchOpsSettingsBody }>(
    '/api/v1/ops/settings',
    {
      schema: {
        body: opsSchemas.PATCH_api_v1_ops_settingsRequestBody,
        response: {
          200: opsSchemas.PATCH_api_v1_ops_settingsResponse200,
          400: opsSchemas.PATCH_api_v1_ops_settingsResponse400,
          403: opsSchemas.PATCH_api_v1_ops_settingsResponse403,
          409: opsSchemas.PATCH_api_v1_ops_settingsResponse409,
        },
      },
    },
    async (request, reply) => {
      const roleCheck = assertPatchOpsSettingsAllowedForRole(request.clientRole, request.body);
      if (!roleCheck.ok) {
        return reply.code(403).send({
          code: 'AUTH_FORBIDDEN',
          message: `These settings fields are not allowed for role "${request.clientRole ?? 'unknown'}": ${roleCheck.forbiddenKeys.join(', ')}.`,
        });
      }

      return serializeSettingsUpdate(async () => {
        const previousSettings = db.getOpsSettings();
        const patch = await buildOpsSettingsUpdate(db, request.body);
        if ('code' in patch) {
          return reply.code(400).send(patch);
        }

        try {
          const updated = db.updateOpsSettings(patch);
          if (request.body.rooms !== undefined) {
            applyRoomPanelSettingsEffects({
              previous: previousSettings,
              updated,
              sessions,
              publishQueueUpdate: () => void publishTvQueueUpdate(db),
            });
          }
          if (
            request.body.contactLookupFolderPath !== undefined ||
            request.body.contactLookupDelimiterMode !== undefined ||
            request.body.contactLookupHasHeader !== undefined ||
            request.body.contactLookupMapping !== undefined
          ) {
            invalidateContactLookupCache();
          }
          return toOpsSettingsResponse(updated);
        } catch (error) {
          const invalid = opsSettingsInvalidResponse(error);
          if (invalid) {
            return reply.code(opsSettingsInvalidHttpStatus(invalid.code)).send({
              code: invalid.code,
              message: invalid.message,
              ...(invalid.details ? { details: invalid.details } : {}),
            });
          }
          throw error;
        }
      });
    },
  );
}
