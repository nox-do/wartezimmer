import type { FastifyInstance } from 'fastify';
import type { CoreDatabase } from '../shared/db/database.js';
import { queueSchemas } from '../api/generated/queue.fastify-schemas.js';
import { commonSchemas } from '../api/generated/common.fastify-schemas.js';
import type {
  MarkAbsenceLookupBody,
  SetCallbackPhoneBody,
  SetIdentityRefBody,
  QueueSupersedeBody,
  VisitParams,
  QueueVisitTransitionBody,
} from '../api/queue-openapi-types.js';
import {
  getQueueRevision,
  publishExpiredRecallWindows,
  publishTvQueueUpdate,
} from '../shared/queue/queue-stream-hub.js';
import { buildMfaQueueSnapshot } from '../shared/queue/mfa-queue-snapshot.js';
import { buildRoomPanelQueueSnapshot } from '../shared/queue/room-panel-queue-snapshot.js';
import { buildTvQueueSnapshot } from '../shared/queue/tv-queue-snapshot.js';
import { handleQueueRouteError } from './queue/queue-errors.js';
import { runQueueMutation } from './queue/queue-mutations.js';
import { resolveDomainError, sendApiError, sendDomainError } from '../http/domain-error-mapper.js';
import { resolveRoomPanelForSession } from '../shared/room-panel/room-panel-policy.js';
import {
  applyQueueVisitTransition,
  buildQueueTransitionResponse,
} from './queue/queue-visit-transitions.js';

const queueErrorResponse = commonSchemas.Error;

const queueVisitTransitionResponses = {
  200: queueSchemas.POST_api_v1_queue_visitId_transitionResponse200,
  400: queueErrorResponse,
  403: queueErrorResponse,
  404: queueErrorResponse,
  409: queueErrorResponse,
  502: queueErrorResponse,
} as const;

const queueCallbackPhoneResponses = {
  200: queueSchemas.PUT_api_v1_queue_visitId_callback_phoneResponse200,
  400: queueErrorResponse,
  404: queueErrorResponse,
  409: queueErrorResponse,
} as const;

const queueCallbackPhoneClearResponses = {
  200: queueSchemas.DELETE_api_v1_queue_visitId_callback_phoneResponse200,
  404: queueErrorResponse,
  409: queueErrorResponse,
} as const;

const queueIdentityRefResponses = {
  200: queueSchemas.PATCH_api_v1_queue_visitId_identity_refResponse200,
  400: queueErrorResponse,
  404: queueErrorResponse,
  409: queueErrorResponse,
} as const;

const queueSupersedeResponses = {
  200: queueSchemas.POST_api_v1_queue_visitId_supersedeResponse200,
  400: queueErrorResponse,
  403: queueErrorResponse,
  404: queueErrorResponse,
  409: queueErrorResponse,
} as const;

function notifyTvQueueChanged(db: CoreDatabase): void {
  publishTvQueueUpdate(db);
}

export function registerQueueRoutes(app: FastifyInstance, db: CoreDatabase): void {
  app.get(
    '/api/v1/queue',
    {
      schema: {
        response: {
          200: queueSchemas.GET_api_v1_queueResponse200,
        },
      },
    },
    async (request, reply) => {
      publishExpiredRecallWindows(db);
      const now = Date.now();
      const role = request.clientRole;
      if (role === 'tv') {
        return buildTvQueueSnapshot(db, getQueueRevision());
      }
      if (role === 'room-panel') {
        if (
          request.authSession?.kind === 'room-panel' &&
          resolveRoomPanelForSession(db, request.authSession)
        ) {
          return buildRoomPanelQueueSnapshot(db, getQueueRevision(), request.authSession);
        }
        return sendApiError(reply, 403, {
          code: 'AUTH_FORBIDDEN',
          message: 'Raum-Panel-Session erforderlich.',
        });
      }

      return buildMfaQueueSnapshot(db, getQueueRevision(), now);
    },
  );

  app.get(
    '/api/v1/queue/summary',
    {
      schema: {
        response: {
          200: queueSchemas.GET_api_v1_queue_summaryResponse200,
        },
      },
    },
    async () => {
      const summary = db.getQueueSummary();
      const ops = db.getOpsState();

      return {
        ...summary,
        checkinLocked: ops.checkinLocked,
        dayClosePhase: ops.dayClosePhase,
        serverTime: new Date().toISOString(),
      };
    },
  );

  app.post<{ Params: VisitParams; Body: QueueVisitTransitionBody }>(
    '/api/v1/queue/:visitId/transition',
    {
      schema: {
        params: queueSchemas.POST_api_v1_queue_visitId_transitionParams,
        body: queueSchemas.POST_api_v1_queue_visitId_transitionRequestBody,
        response: queueVisitTransitionResponses,
      },
    },
    async (request, reply) => {
      const visitId = request.params.visitId.trim();
      const response = await applyQueueVisitTransition(
        db,
        reply,
        visitId,
        request.body,
        request.authSession,
      );
      if (response) {
        notifyTvQueueChanged(db);
        return response;
      }
    },
  );

  app.post<{ Body: MarkAbsenceLookupBody }>(
    '/api/v1/queue/mark-absence',
    {
      schema: {
        body: queueSchemas.POST_api_v1_queue_mark_absenceRequestBody,
        response: {
          200: queueSchemas.POST_api_v1_queue_mark_absenceResponse200,
          400: queueErrorResponse,
          404: queueErrorResponse,
          409: queueErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const phoneNumber = request.body.phoneNumber?.trim() ?? '';
      const ticketCode = request.body.ticketCode?.trim() ?? '';
      if (!phoneNumber && !ticketCode) {
        return sendApiError(reply, 400, {
          code: 'INVALID_ARGUMENT',
          message: 'Handynummer oder Wartenummer ist erforderlich.',
        });
      }

      try {
        const result = await db.markAbsenceByLookup({
          phoneNumber: phoneNumber || undefined,
          ticketCode: ticketCode || undefined,
          mode: request.body.mode,
        });
        notifyTvQueueChanged(db);
        return buildQueueTransitionResponse(result, result.visitId);
      } catch (error) {
        if (
          sendDomainError(reply, error, {
            details:
              error instanceof Error &&
              (error.message === 'TICKET_CODE_REQUIRED' || error.message === 'TICKET_AMBIGUOUS')
                ? { requiresTicketCode: true }
                : undefined,
          })
        ) {
          return;
        }

        const resolved = resolveDomainError(error);
        if (resolved?.code === 'VISIT_NOT_FOUND') {
          return sendApiError(reply, 404, {
            code: 'VISIT_NOT_FOUND',
            message: 'Patient nicht in der Warteliste gefunden.',
          });
        }

        const handled = handleQueueRouteError(reply, 'lookup', error, {
          invalidTransitionMessage: 'Patient kann nicht auf abwesend gesetzt werden.',
        });
        if (handled) {
          return;
        }
        throw error;
      }
    },
  );

  app.put<{ Params: VisitParams; Body: SetCallbackPhoneBody }>(
    '/api/v1/queue/:visitId/callback-phone',
    {
      schema: {
        params: queueSchemas.PUT_api_v1_queue_visitId_callback_phoneParams,
        body: queueSchemas.PUT_api_v1_queue_visitId_callback_phoneRequestBody,
        response: queueCallbackPhoneResponses,
      },
    },
    async (request, reply) => {
      const visitId = request.params.visitId.trim();
      return runQueueMutation({
        db,
        reply,
        ticketId: visitId,
        execute: () =>
          db.setCallbackPhone(visitId, request.body.callbackPhone, request.authSession?.sessionId),
        mapSuccess: (result) => ({
          visitId,
          callbackPhone: result.callbackPhone,
          updatedAt: result.updatedAt,
        }),
        invalidTransitionMessage: `Fuer Ticket ${visitId} kann keine Rückrufnummer gespeichert werden.`,
      });
    },
  );

  app.delete<{ Params: VisitParams }>(
    '/api/v1/queue/:visitId/callback-phone',
    {
      schema: {
        params: queueSchemas.DELETE_api_v1_queue_visitId_callback_phoneParams,
        response: queueCallbackPhoneClearResponses,
      },
    },
    async (request, reply) => {
      const visitId = request.params.visitId.trim();
      return runQueueMutation({
        db,
        reply,
        ticketId: visitId,
        execute: () => db.clearCallbackPhone(visitId),
        mapSuccess: (result) => ({
          visitId,
          updatedAt: result.updatedAt,
        }),
        invalidTransitionMessage: `Fuer Ticket ${visitId} kann keine Rückrufnummer geloescht werden.`,
      });
    },
  );

  app.patch<{ Params: VisitParams; Body: SetIdentityRefBody }>(
    '/api/v1/queue/:visitId/identity-ref',
    {
      schema: {
        params: queueSchemas.PATCH_api_v1_queue_visitId_identity_refParams,
        body: queueSchemas.PATCH_api_v1_queue_visitId_identity_refRequestBody,
        response: queueIdentityRefResponses,
      },
    },
    async (request, reply) => {
      const visitId = request.params.visitId.trim();
      return runQueueMutation({
        db,
        reply,
        ticketId: visitId,
        execute: () => db.setIdentityRef(visitId, request.body.identityRef),
        mapSuccess: (result) => ({
          visitId,
          identityRef: result.identityRef,
          updatedAt: result.updatedAt,
        }),
        invalidTransitionMessage: `Fuer Ticket ${visitId} kann der Anzeigename nicht geändert werden.`,
      });
    },
  );

  app.post<{ Params: VisitParams; Body: QueueSupersedeBody }>(
    '/api/v1/queue/:visitId/supersede',
    {
      schema: {
        params: queueSchemas.POST_api_v1_queue_visitId_supersedeParams,
        body: queueSchemas.POST_api_v1_queue_visitId_supersedeRequestBody,
        response: queueSupersedeResponses,
      },
    },
    async (request, reply) => {
      const visitId = request.params.visitId.trim();
      return runQueueMutation({
        db,
        reply,
        ticketId: visitId,
        execute: () =>
          db.supersedeVisit(visitId, request.body.topicId, request.authSession?.sessionId),
        mapSuccess: (result) => ({
          resultType: 'supersede' as const,
          supersededVisitId: result.supersededVisitId,
          visitId: result.visitId,
          laneCode: result.laneCode,
          number: result.number,
          topicId: result.topicId,
          topicLabel: result.topicLabel,
          destinationRoomLabel: result.destinationRoomLabel,
          checkedInAt: result.checkedInAt,
          documentsRebound: result.documentsRebound,
        }),
        invalidTransitionMessage: `Ticket ${visitId} kann nicht auf ein anderes Thema umgebucht werden.`,
      });
    },
  );
}
