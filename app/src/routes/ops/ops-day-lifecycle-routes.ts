import type { FastifyInstance } from 'fastify';
import type { CoreDatabase } from '../../shared/db/database.js';
import type { BusinessDayResetBody, CheckinLockBody } from '../../api/ops-openapi-types.js';
import { opsSchemas } from '../../api/generated/ops.fastify-schemas.js';
import { notifyEmergencyChanged } from '../../shared/ops/ops-emergency-events.js';
import { publishTvQueueUpdate } from '../../shared/queue/queue-stream-hub.js';
import { resyncRecallWindowExpiryScheduler } from '../../shared/queue/recall-window-expiry-scheduler.js';
import { scheduleContactLookupCacheRefreshAfterBusinessDayReset } from '../../shared/contacts/contact-lookup-day-refresh.js';
import { sendApiError } from '../../http/domain-error-mapper.js';
import { withSandboxIntakePaused } from '../../shared/sandbox/sandbox-intake-gate.js';
import { handleOpsRouteError } from './ops-errors.js';
import {
  purgeSandboxIntakeForDayReset,
  requestSandboxRestartForDayReset,
} from './ops-sandbox-restart.js';

function notifyTvQueueChanged(db: CoreDatabase): void {
  publishTvQueueUpdate(db);
}

function completeBusinessDayReset(app: FastifyInstance, db: CoreDatabase) {
  const reset = db.resetBusinessDay();
  if (reset.emergencyCleared) {
    notifyEmergencyChanged(db);
  }
  notifyTvQueueChanged(db);
  resyncRecallWindowExpiryScheduler(db);
  scheduleContactLookupCacheRefreshAfterBusinessDayReset(db, app.log);
  return {
    ...reset,
    sandboxRestartInitiated: true as const,
  };
}

export function registerOpsDayLifecycleRoutes(app: FastifyInstance, db: CoreDatabase): void {
  app.get(
    '/api/v1/ops/day-lifecycle',
    {
      schema: {
        response: {
          200: opsSchemas.GET_api_v1_ops_day_lifecycleResponse200,
        },
      },
    },
    async () => {
      return db.getDayLifecycleState();
    },
  );

  app.post<{ Body: BusinessDayResetBody }>(
    '/api/v1/ops/day-lifecycle/reset',
    {
      schema: {
        body: opsSchemas.POST_api_v1_ops_day_lifecycle_resetRequestBody,
        response: {
          200: opsSchemas.POST_api_v1_ops_day_lifecycle_resetResponse200,
          400: opsSchemas.POST_api_v1_ops_day_lifecycle_resetResponse400,
          409: opsSchemas.POST_api_v1_ops_day_lifecycle_resetResponse409,
          503: opsSchemas.POST_api_v1_ops_day_lifecycle_resetResponse503,
        },
      },
    },
    async (_request, reply) => {
      try {
        const recoveringUncertainPurge = db.isSandboxResetPending();
        db.beginSandboxReset();
        notifyTvQueueChanged(db);

        return await withSandboxIntakePaused(async () => {
          if (
            recoveringUncertainPurge &&
            !(await requestSandboxRestartForDayReset(app, 'day-lifecycle-reset-recovery'))
          ) {
            return sendApiError(reply, 503, {
              code: 'SANDBOX_UNAVAILABLE',
              message: 'Sandbox-Neustart konnte nicht bestätigt werden. Der Reset bleibt gesperrt.',
            });
          }
          try {
            await purgeSandboxIntakeForDayReset(app, 'day-lifecycle-reset');
          } catch {
            sendApiError(reply, 503, {
              code: 'SANDBOX_UNAVAILABLE',
              message:
                'Sandbox-Bereinigung fehlgeschlagen. Der Tagesreset wurde nicht abgeschlossen; Check-in bleibt gesperrt.',
            });
            return;
          }
          if (!(await requestSandboxRestartForDayReset(app, 'day-lifecycle-reset'))) {
            return sendApiError(reply, 503, {
              code: 'SANDBOX_UNAVAILABLE',
              message:
                'Sandbox-Neustart konnte nicht bestätigt werden. Der Tagesreset bleibt gesperrt und kann erneut versucht werden.',
            });
          }
          return completeBusinessDayReset(app, db);
        });
      } catch (error) {
        const handled = handleOpsRouteError(reply, error, {});
        if (handled) {
          return;
        }
        throw error;
      }
    },
  );

  app.post<{ Body: CheckinLockBody }>(
    '/api/v1/ops/checkin-lock',
    {
      schema: {
        body: opsSchemas.POST_api_v1_ops_checkin_lockRequestBody,
        response: {
          200: opsSchemas.POST_api_v1_ops_checkin_lockResponse200,
          400: opsSchemas.POST_api_v1_ops_checkin_lockResponse400,
          409: opsSchemas.POST_api_v1_ops_checkin_lockResponse409,
        },
      },
    },
    async (request, reply) => {
      try {
        const next = request.body.locked;
        const state = db.setCheckinLock(next);
        notifyTvQueueChanged(db);
        const ops = db.getOpsState();
        return {
          checkinLocked: state.checkinLocked,
          dayClosePhase: ops.dayClosePhase,
          updatedAt: state.updatedAt,
        };
      } catch (error) {
        const handled = handleOpsRouteError(reply, error, {
          dayCloseInProgressMessage:
            'Check-in kann waehrend laufendem Day-close nicht entsperrt werden.',
        });
        if (handled) {
          return;
        }

        throw error;
      }
    },
  );

  app.post(
    '/api/v1/ops/day-close/start',
    {
      schema: {
        response: {
          200: opsSchemas.POST_api_v1_ops_day_close_startResponse200,
          400: opsSchemas.POST_api_v1_ops_day_close_startResponse400,
          409: opsSchemas.POST_api_v1_ops_day_close_startResponse409,
        },
      },
    },
    async (_request, reply) => {
      try {
        const state = db.startDayClose();
        const ops = db.getOpsState();
        return {
          checkinLocked: ops.checkinLocked,
          dayClosePhase: state.dayClosePhase,
          updatedAt: state.updatedAt,
        };
      } catch (error) {
        const handled = handleOpsRouteError(reply, error, {
          checkinLockRequiredMessage:
            'Day-close kann nur bei aktivem Check-in-Lock gestartet werden.',
          invalidDayClosePhaseMessage: 'Day-close wurde bereits gestartet.',
        });
        if (handled) {
          return;
        }

        throw error;
      }
    },
  );
}
