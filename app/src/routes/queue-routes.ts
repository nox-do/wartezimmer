import type { FastifyInstance } from 'fastify';
import type { CoreDatabase } from '../shared/db/database.js';
import { queueSchemas } from '../api/generated/queue.fastify-schemas.js';
import { commonSchemas } from '../api/generated/common.fastify-schemas.js';
import type {
  MarkAbsenceLookupBody,
  SetCallbackPhoneBody,
  SetIdentityRefBody,
  TicketParams,
  QueueTicketTransitionBody,
  QueueTicketTransitionResponse,
  QueueTransitionResponse,
  QueueTriageResponse,
} from '../api/queue-openapi-types.js';
import { dispatchRecallNotifyAndPersist } from '../shared/messaging/recall-notify-persist.js';
import type { MessageDispatchResult } from '../shared/messaging/sms-sender.js';
import { assertQueueCallAnnouncementReachable } from '../shared/queue/call-announcement-guard.js';
import {
  getQueueRevision,
  publishExpiredRecallWindows,
  publishTvQueueUpdate,
} from '../shared/queue/queue-stream-hub.js';
import { buildMfaQueueSnapshot } from '../shared/queue/mfa-queue-snapshot.js';
import { buildRoomPanelQueueSnapshot } from '../shared/queue/room-panel-queue-snapshot.js';
import { buildTvQueueSnapshot } from '../shared/queue/tv-queue-snapshot.js';
import { handleQueueRouteError } from './queue/queue-errors.js';
import { resolveDomainError, sendApiError, sendDomainError } from '../http/domain-error-mapper.js';
import type { AuthSession, RoomPanelSession } from '../auth/staff-session-auth.js';
import {
  resolveRoomPanelForSession,
  roomPanelCanCheckIn,
  roomPanelCanCheckOut,
} from '../shared/room-panel/room-panel-policy.js';

const queueErrorResponse = commonSchemas.Error;

const roomAtCapacityMessage = 'Raum ist voll — bitte anderes Aufrufziel wählen.';

const queueTicketTransitionResponses = {
  200: queueSchemas.POST_api_v1_queue_visitId_transitionResponse200,
  400: queueErrorResponse,
  404: queueErrorResponse,
  409: queueErrorResponse,
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

function notifyTvQueueChanged(db: CoreDatabase): void {
  publishTvQueueUpdate(db);
}

function transitionBody(
  transition: { fromStatus: string; toStatus: string },
  visitId: string,
): {
  resultType: 'transition';
  visitId: string;
  fromStatus: QueueTransitionResponse['fromStatus'];
  toStatus: QueueTransitionResponse['toStatus'];
  updatedAt: string;
  roomId: null;
  roomLabel: null;
} {
  return {
    resultType: 'transition',
    visitId,
    fromStatus: transition.fromStatus as QueueTransitionResponse['fromStatus'],
    toStatus: transition.toStatus as QueueTransitionResponse['toStatus'],
    updatedAt: new Date().toISOString(),
    roomId: null,
    roomLabel: null,
  };
}

function runTicketTransition<TTransition, TResponse>(input: {
  reply: Parameters<typeof handleQueueRouteError>[0];
  ticketId: string;
  execute: () => TTransition;
  mapSuccess: (transition: TTransition) => TResponse;
  errorOptions: Parameters<typeof handleQueueRouteError>[3];
}): TResponse | undefined {
  try {
    const transition = input.execute();
    return input.mapSuccess(transition);
  } catch (error) {
    const handled = handleQueueRouteError(input.reply, input.ticketId, error, input.errorOptions);
    if (handled) {
      return undefined;
    }
    throw error;
  }
}

async function applyQueueTicketTransition(
  db: CoreDatabase,
  reply: Parameters<typeof handleQueueRouteError>[0],
  ticketId: string,
  body: QueueTicketTransitionBody,
  authSession?: AuthSession,
): Promise<QueueTicketTransitionResponse | undefined> {
  if (authSession?.kind === 'room-panel') {
    return applyRoomPanelQueueTicketTransition(db, reply, ticketId, body, authSession);
  }

  switch (body.type) {
    case 'call': {
      const roomId = body.roomId?.trim();
      const roomLabel = body.roomLabel?.trim();

      try {
        assertQueueCallAnnouncementReachable();
      } catch (error) {
        if (
          handleQueueRouteError(reply, ticketId, error, {
            invalidTransitionMessage: `Ticket ${ticketId} kann nicht aufgerufen werden.`,
            roomAtCapacityMessage,
            callAnnouncementOfflineMessage:
              'Aufruf nicht möglich — Wartezimmer-Anzeige ist offline. Bitte TV prüfen oder koppeln.',
          })
        ) {
          return undefined;
        }
        throw error;
      }

      return runTicketTransition({
        reply,
        ticketId,
        execute: () => db.callTicket(ticketId, roomId, roomLabel),
        mapSuccess: (transition) => ({
          ...transitionBody(transition, ticketId),
          roomId: roomId ?? null,
          roomLabel: roomLabel ?? null,
        }),
        errorOptions: {
          invalidTransitionMessage: `Ticket ${ticketId} kann nicht aufgerufen werden.`,
          roomAtCapacityMessage,
          callAnnouncementOfflineMessage:
            'Aufruf nicht möglich — Wartezimmer-Anzeige ist offline. Bitte TV prüfen oder koppeln.',
        },
      });
    }
    case 'check_in_room': {
      const roomId = body.roomId?.trim();
      const roomLabel = body.roomLabel?.trim();
      const actingRoomId = body.actingRoomId?.trim();

      return runTicketTransition({
        reply,
        ticketId,
        execute: () => db.checkInRoom(ticketId, roomId, roomLabel, actingRoomId),
        mapSuccess: (transition) => ({
          ...transitionBody(transition, ticketId),
          roomId: roomId ?? null,
          roomLabel: roomLabel ?? null,
        }),
        errorOptions: {
          invalidTransitionMessage: `Ticket ${ticketId} kann nicht in Behandlung gesetzt werden.`,
          roomAtCapacityMessage,
          roomScopeMismatchMessage:
            'Check-in nur im aktuell zugewiesenen Raum möglich — bitte am richtigen Raum-Panel oder MFA nutzen.',
        },
      });
    }
    case 'reassign_room': {
      const roomId = body.roomId?.trim();
      const roomLabel = body.roomLabel?.trim();
      if (!roomId) {
        sendApiError(reply, 400, {
          code: 'INVALID_ARGUMENT',
          message: 'Bitte ein gültiges Aufrufziel angeben.',
        });
        return undefined;
      }

      return runTicketTransition({
        reply,
        ticketId,
        execute: () => db.reassignRoom(ticketId, roomId, roomLabel),
        mapSuccess: (transition) => ({
          ...transitionBody(transition, ticketId),
          roomId: roomId ?? null,
          roomLabel: roomLabel ?? null,
        }),
        errorOptions: {
          invalidTransitionMessage: `Ticket ${ticketId} kann nicht umgeleitet werden.`,
          roomRequiredMessage: 'Bitte ein gültiges Aufrufziel angeben.',
          roomAtCapacityMessage,
        },
      });
    }
    case 'check_out_room': {
      const actingRoomId = body.actingRoomId?.trim();
      return runTicketTransition({
        reply,
        ticketId,
        execute: () => db.checkOutRoom(ticketId, actingRoomId),
        mapSuccess: (transition) => transitionBody(transition, ticketId),
        errorOptions: {
          invalidTransitionMessage: `Ticket ${ticketId} kann nicht aus Behandlung ausgecheckt werden.`,
          roomScopeMismatchMessage:
            'Check-out nur im aktuell zugewiesenen Raum möglich — bitte am richtigen Raum-Panel oder MFA nutzen.',
        },
      });
    }
    case 'return_to_waiting':
      return runTicketTransition({
        reply,
        ticketId,
        execute: () => db.returnToWaiting(ticketId),
        mapSuccess: (transition) => transitionBody(transition, ticketId),
        errorOptions: {
          invalidTransitionMessage: `Ticket ${ticketId} kann nicht ins Wartezimmer zurueck.`,
        },
      });
    case 'cycle_triage':
      try {
        const result = db.cycleTriage(ticketId);
        return {
          resultType: 'triage',
          visitId: ticketId,
          triageLevel: result.triageLevel as QueueTriageResponse['triageLevel'],
          updatedAt: result.updatedAt,
        };
      } catch (error) {
        const handled = handleQueueRouteError(reply, ticketId, error, {
          invalidTransitionMessage: `Fuer Ticket ${ticketId} kann keine Markierung gesetzt werden.`,
        });
        if (handled) {
          return undefined;
        }
        throw error;
      }
    case 'set_absence': {
      if (!body.mode) {
        sendApiError(reply, 400, {
          code: 'INVALID_ARGUMENT',
          message: 'Abwesenheitsmodus ist erforderlich.',
        });
        return undefined;
      }
      const absenceMode = body.mode;
      return runTicketTransition({
        reply,
        ticketId,
        execute: () => db.setAbsence(ticketId, absenceMode),
        mapSuccess: (transition) => transitionBody(transition, ticketId),
        errorOptions: {
          invalidTransitionMessage: `Ticket ${ticketId} kann nicht als abwesend markiert werden.`,
        },
      });
    }
    case 'recall': {
      const notifyChannel = body.notifyChannel ?? 'sms';
      try {
        const transition = db.recallTicket(ticketId, body.returnWindowMinutes);
        let smsDispatch: MessageDispatchResult | null = null;
        if (transition.callbackPhone) {
          smsDispatch = await dispatchRecallNotifyAndPersist(
            db,
            ticketId,
            {
              callbackPhone: transition.callbackPhone,
              returnWindowMinutes: transition.returnWindowMinutes,
              returnUntil: transition.returnUntil,
              checkinLocale: transition.checkinLocale,
            },
            notifyChannel,
          );
        }
        return {
          resultType: 'recall',
          visitId: ticketId,
          fromStatus: transition.fromStatus as QueueTransitionResponse['fromStatus'],
          toStatus: transition.toStatus as QueueTransitionResponse['toStatus'],
          updatedAt: new Date().toISOString(),
          returnUntil: transition.returnUntil,
          smsDispatch,
        };
      } catch (error) {
        const handled = handleQueueRouteError(reply, ticketId, error, {
          invalidTransitionMessage: `Ticket ${ticketId} kann nicht zurueckgeholt werden.`,
          missingCallbackPhoneMessage: 'Rueckholen per SMS nicht moeglich: callbackPhone fehlt.',
        });
        if (handled) {
          return undefined;
        }
        throw error;
      }
    }
    case 'retry_recall_notify': {
      const notifyChannel = body.notifyChannel ?? 'sms';
      try {
        const retry = db.retryRecallNotify(ticketId);
        const smsDispatch = await dispatchRecallNotifyAndPersist(
          db,
          ticketId,
          {
            callbackPhone: retry.callbackPhone,
            returnWindowMinutes: retry.returnWindowMinutes,
            returnUntil: retry.returnUntil,
            checkinLocale: retry.checkinLocale,
          },
          notifyChannel,
        );
        return {
          resultType: 'recall_notify_retry',
          visitId: ticketId,
          returnUntil: retry.returnUntil,
          recallNotifyErrorCode: smsDispatch.sent ? null : (smsDispatch.errorCode ?? 'UNKNOWN'),
          smsDispatch,
        };
      } catch (error) {
        const handled = handleQueueRouteError(reply, ticketId, error, {
          invalidTransitionMessage: `Ticket ${ticketId} kann keine Rückhol-SMS erneut senden.`,
          missingCallbackPhoneMessage:
            'Fuer erneuten SMS-Versand ist eine Handynummer erforderlich.',
          recallNotifyRetryNotAllowedMessage:
            'Erneuter SMS-Versand ist fuer dieses Ticket nicht moeglich.',
          recallWindowExpiredMessage:
            'Das Rueckkehrfenster ist abgelaufen — erneuter SMS-Versand nicht moeglich.',
        });
        if (handled) {
          return undefined;
        }
        throw error;
      }
    }
    default:
      sendApiError(reply, 400, {
        code: 'INVALID_ARGUMENT',
        message: 'Unbekannte Ticket-Aktion.',
      });
      return undefined;
  }
}

async function applyRoomPanelQueueTicketTransition(
  db: CoreDatabase,
  reply: Parameters<typeof handleQueueRouteError>[0],
  ticketId: string,
  body: QueueTicketTransitionBody,
  session: RoomPanelSession,
): Promise<QueueTicketTransitionResponse | undefined> {
  const activePanel = resolveRoomPanelForSession(db, session);
  if (!activePanel) {
    sendApiError(reply, 403, {
      code: 'AUTH_FORBIDDEN',
      message: 'Raum-Panel ist deaktiviert oder die Platzierung wurde geändert.',
    });
    return undefined;
  }

  if (body.type !== 'check_in_room' && body.type !== 'check_out_room') {
    sendApiError(reply, 403, {
      code: 'AUTH_FORBIDDEN',
      message: 'Raum-Panel darf diese Ticket-Aktion nicht ausfuehren.',
    });
    return undefined;
  }

  if (body.type === 'check_in_room' && !roomPanelCanCheckIn(activePanel.panel)) {
    sendApiError(reply, 403, {
      code: 'AUTH_FORBIDDEN',
      message: 'Ankunftsbestätigung ist für dieses Raum-Panel nicht aktiviert.',
    });
    return undefined;
  }

  if (body.type === 'check_out_room' && !roomPanelCanCheckOut(activePanel.panel)) {
    sendApiError(reply, 403, {
      code: 'AUTH_FORBIDDEN',
      message: 'Check-out ist nur im Raum-Panel-Modus staff_full erlaubt.',
    });
    return undefined;
  }

  if (body.type === 'check_in_room') {
    return runTicketTransition({
      reply,
      ticketId,
      execute: () => db.checkInRoom(ticketId, undefined, undefined, session.roomId),
      mapSuccess: (transition) => ({
        ...transitionBody(transition, ticketId),
        roomId: session.roomId,
        roomLabel: null,
      }),
      errorOptions: {
        invalidTransitionMessage: `Ticket ${ticketId} kann nicht in Behandlung gesetzt werden.`,
        roomAtCapacityMessage,
        roomScopeMismatchMessage:
          'Check-in nur im aktuell zugewiesenen Raum möglich — bitte am richtigen Raum-Panel oder MFA nutzen.',
      },
    });
  }

  return runTicketTransition({
    reply,
    ticketId,
    execute: () => db.checkOutRoom(ticketId, session.roomId),
    mapSuccess: (transition) => transitionBody(transition, ticketId),
    errorOptions: {
      invalidTransitionMessage: `Ticket ${ticketId} kann nicht aus Behandlung ausgecheckt werden.`,
      roomScopeMismatchMessage:
        'Check-out nur im aktuell zugewiesenen Raum möglich — bitte am richtigen Raum-Panel oder MFA nutzen.',
    },
  });
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

  app.post<{ Params: TicketParams; Body: QueueTicketTransitionBody }>(
    '/api/v1/queue/:visitId/transition',
    {
      schema: {
        params: queueSchemas.POST_api_v1_queue_visitId_transitionParams,
        body: queueSchemas.POST_api_v1_queue_visitId_transitionRequestBody,
        response: queueTicketTransitionResponses,
      },
    },
    async (request, reply) => {
      const ticketId = request.params.visitId.trim();
      const response = await applyQueueTicketTransition(
        db,
        reply,
        ticketId,
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
        return transitionBody(result, result.visitId);
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
        if (resolved?.code === 'TICKET_NOT_FOUND') {
          return sendApiError(reply, 404, {
            code: 'TICKET_NOT_FOUND',
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

  app.put<{ Params: TicketParams; Body: SetCallbackPhoneBody }>(
    '/api/v1/queue/:visitId/callback-phone',
    {
      schema: {
        params: queueSchemas.PUT_api_v1_queue_visitId_callback_phoneParams,
        body: queueSchemas.PUT_api_v1_queue_visitId_callback_phoneRequestBody,
        response: queueCallbackPhoneResponses,
      },
    },
    async (request, reply) => {
      const ticketId = request.params.visitId.trim();
      try {
        const result = db.setCallbackPhone(ticketId, request.body.callbackPhone);
        notifyTvQueueChanged(db);
        return {
          visitId: ticketId,
          callbackPhone: result.callbackPhone,
          updatedAt: result.updatedAt,
        };
      } catch (error) {
        const handled = handleQueueRouteError(reply, ticketId, error, {
          invalidTransitionMessage: `Fuer Ticket ${ticketId} kann keine Rückrufnummer gespeichert werden.`,
        });
        if (handled) {
          return;
        }
        throw error;
      }
    },
  );

  app.delete<{ Params: TicketParams }>(
    '/api/v1/queue/:visitId/callback-phone',
    {
      schema: {
        params: queueSchemas.DELETE_api_v1_queue_visitId_callback_phoneParams,
        response: queueCallbackPhoneClearResponses,
      },
    },
    async (request, reply) => {
      const ticketId = request.params.visitId.trim();
      try {
        const result = db.clearCallbackPhone(ticketId);
        notifyTvQueueChanged(db);
        return {
          visitId: ticketId,
          updatedAt: result.updatedAt,
        };
      } catch (error) {
        const handled = handleQueueRouteError(reply, ticketId, error, {
          invalidTransitionMessage: `Fuer Ticket ${ticketId} kann keine Rückrufnummer geloescht werden.`,
        });
        if (handled) {
          return;
        }
        throw error;
      }
    },
  );

  app.patch<{ Params: TicketParams; Body: SetIdentityRefBody }>(
    '/api/v1/queue/:visitId/identity-ref',
    {
      schema: {
        params: queueSchemas.PATCH_api_v1_queue_visitId_identity_refParams,
        body: queueSchemas.PATCH_api_v1_queue_visitId_identity_refRequestBody,
        response: queueIdentityRefResponses,
      },
    },
    async (request, reply) => {
      const ticketId = request.params.visitId.trim();
      try {
        const result = db.setIdentityRef(ticketId, request.body.identityRef);
        notifyTvQueueChanged(db);
        return {
          visitId: ticketId,
          identityRef: result.identityRef,
          updatedAt: result.updatedAt,
        };
      } catch (error) {
        const handled = handleQueueRouteError(reply, ticketId, error, {
          invalidTransitionMessage: `Fuer Ticket ${ticketId} kann kein Anzeigename gesetzt werden.`,
        });
        if (handled) {
          return;
        }
        throw error;
      }
    },
  );
}
