import type { FastifyReply } from 'fastify';
import type { CoreDatabase } from '../../shared/db/database.js';
import type { QueueDisplayStatus } from '../../shared/db/db-types.js';
import type {
  QueueVisitTransitionBody,
  QueueVisitTransitionResponse,
  QueueTransitionResponse,
} from '../../api/queue-openapi-types.js';
import { dispatchRecallNotifyAndPersist } from '../../shared/messaging/recall-notify-persist.js';
import type { MessageDispatchResult } from '../../shared/messaging/sms-sender.js';
import { assertQueueCallAnnouncementReachable } from '../../shared/queue/call-announcement-guard.js';
import { sendApiError } from '../../http/domain-error-mapper.js';
import type { AuthSession, RoomPanelGrant } from '../../auth/session-grants.js';
import { resolveRoomPanelForSession } from '../../shared/room-panel/room-panel-policy.js';
import {
  assertRoomPanelCallVisitScope,
  resolveRoomPanelSnapshotPolicy,
} from '../../shared/room-panel/room-panel-snapshot-policy.js';
import { PF_FLOW_LOC_WAITING } from '../../shared/flow-core/catalog-ids.js';
import { handleQueueRouteError } from './queue-errors.js';

type QueueReply = Parameters<typeof handleQueueRouteError>[0];
type QueueErrorOptions = Parameters<typeof handleQueueRouteError>[3];

const roomAtCapacityMessage = 'Raum ist voll — bitte anderes Aufrufziel wählen.';

const callAnnouncementOfflineMessage =
  'Aufruf nicht möglich — Wartezimmer-Anzeige ist offline. Bitte TV prüfen oder koppeln.';

type StatusTransition = { fromStatus: QueueDisplayStatus; toStatus: QueueDisplayStatus };
type RoomPlacementTransition = StatusTransition & { roomId?: string; roomLabel?: string };

type TransitionContext = {
  db: CoreDatabase;
  reply: QueueReply;
  visitId: string;
  body: QueueVisitTransitionBody;
  actorId?: string;
};

function transitionBody(
  transition: StatusTransition,
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
    fromStatus: transition.fromStatus,
    toStatus: transition.toStatus,
    updatedAt: new Date().toISOString(),
    roomId: null,
    roomLabel: null,
  };
}

function runVisitTransition<TTransition, TResponse>(input: {
  reply: QueueReply;
  visitId: string;
  execute: () => TTransition;
  mapSuccess: (transition: TTransition) => TResponse;
  errorOptions: QueueErrorOptions;
}): TResponse | undefined {
  try {
    const transition = input.execute();
    return input.mapSuccess(transition);
  } catch (error) {
    const handled = handleQueueRouteError(input.reply, input.visitId, error, input.errorOptions);
    if (handled) {
      return undefined;
    }
    throw error;
  }
}

function withCallAnnouncementGuard(
  reply: QueueReply,
  visitId: string,
  errorOptions: QueueErrorOptions,
): boolean {
  try {
    assertQueueCallAnnouncementReachable();
    return true;
  } catch (error) {
    if (handleQueueRouteError(reply, visitId, error, errorOptions)) {
      return false;
    }
    throw error;
  }
}

function roomFields(roomId: string | undefined, roomLabel: string | undefined) {
  return {
    roomId: roomId?.trim(),
    roomLabel: roomLabel?.trim(),
  };
}

type TransitionRunnerContext = Pick<TransitionContext, 'db' | 'reply' | 'visitId' | 'actorId'>;

const checkInRoomScopeMismatchMessage =
  'Check-in nur im aktuell zugewiesenen Raum möglich — bitte am richtigen Raum-Panel oder MFA nutzen.';

const checkOutRoomScopeMismatchMessage =
  'Check-out nur im aktuell zugewiesenen Raum möglich — bitte am richtigen Raum-Panel oder MFA nutzen.';

const panelCallScopeMismatchMessage =
  'Aufruf nur für Tickets mit Ziel dieses Raums möglich — bitte Snapshot aktualisieren.';

function runCallTransition(
  ctx: TransitionRunnerContext,
  input: {
    callTarget?: { roomId?: string; roomLabel?: string };
    responseRoomId: string | null;
    responseRoomLabel: string | null;
    beforeExecute?: () => void;
    roomScopeMismatchMessage?: string;
  },
): QueueVisitTransitionResponse | undefined {
  if (
    !withCallAnnouncementGuard(ctx.reply, ctx.visitId, {
      invalidTransitionMessage: `Ticket ${ctx.visitId} kann nicht aufgerufen werden.`,
      roomAtCapacityMessage,
      callAnnouncementOfflineMessage,
    })
  ) {
    return undefined;
  }

  const { roomId, roomLabel } = input.callTarget ?? {};

  return runVisitTransition({
    reply: ctx.reply,
    visitId: ctx.visitId,
    execute: () => {
      input.beforeExecute?.();
      if (input.callTarget) {
        return ctx.db.callVisit(ctx.visitId, roomId, roomLabel, ctx.actorId);
      }
      // Panel calls confirm routing, never retarget.
      return ctx.db.callVisit(ctx.visitId, undefined, undefined, ctx.actorId);
    },
    mapSuccess: (transition) => ({
      ...transitionBody(transition, ctx.visitId),
      roomId: input.responseRoomId,
      roomLabel: input.responseRoomLabel,
    }),
    errorOptions: {
      invalidTransitionMessage: `Ticket ${ctx.visitId} kann im aktuellen Routing nicht aufgerufen werden.`,
      roomRequiredMessage:
        'Das Aufrufziel ist nicht mehr verfügbar. Bitte das Ticket per Drag & Drop einem gültigen Raum zuweisen.',
      roomAtCapacityMessage,
      callAnnouncementOfflineMessage,
      roomScopeMismatchMessage: input.roomScopeMismatchMessage,
    },
  });
}

function runCheckInRoomTransition(
  ctx: TransitionRunnerContext,
  input: {
    roomId?: string;
    roomLabel?: string;
    actingRoomId?: string;
    responseRoomId?: string | null;
    responseRoomLabel?: string | null;
    explicitPlacement?: boolean;
  },
): QueueVisitTransitionResponse | undefined {
  const { roomId, roomLabel, actingRoomId } = input;

  return runVisitTransition<RoomPlacementTransition, QueueVisitTransitionResponse>({
    reply: ctx.reply,
    visitId: ctx.visitId,
    execute: () =>
      input.explicitPlacement && roomId
        ? ctx.db.placeVisitInRoom(ctx.visitId, roomId, roomLabel, actingRoomId, ctx.actorId)
        : ctx.db.checkInRoom(ctx.visitId, actingRoomId, ctx.actorId),
    mapSuccess: (transition) => ({
      ...transitionBody(transition, ctx.visitId),
      roomId: input.responseRoomId ?? transition.roomId ?? roomId ?? null,
      roomLabel: input.responseRoomLabel ?? transition.roomLabel ?? roomLabel ?? null,
    }),
    errorOptions: {
      invalidTransitionMessage: `Ticket ${ctx.visitId} kann nicht in Behandlung gesetzt werden.`,
      roomRequiredMessage:
        'Das Aufrufziel ist nicht mehr verfügbar. Bitte das Ticket per Drag & Drop einem gültigen Raum zuweisen.',
      roomAtCapacityMessage,
      roomScopeMismatchMessage: checkInRoomScopeMismatchMessage,
    },
  });
}

function runCheckOutRoomTransition(
  ctx: TransitionRunnerContext,
  input: { actingRoomId?: string },
): QueueVisitTransitionResponse | undefined {
  return runVisitTransition({
    reply: ctx.reply,
    visitId: ctx.visitId,
    execute: () => ctx.db.checkOutRoom(ctx.visitId, input.actingRoomId, ctx.actorId),
    mapSuccess: (transition) => transitionBody(transition, ctx.visitId),
    errorOptions: {
      invalidTransitionMessage: `Ticket ${ctx.visitId} kann nicht aus Behandlung ausgecheckt werden.`,
      roomScopeMismatchMessage: checkOutRoomScopeMismatchMessage,
    },
  });
}

function handleCall(ctx: TransitionContext): QueueVisitTransitionResponse | undefined {
  const { roomId, roomLabel } = roomFields(ctx.body.roomId, ctx.body.roomLabel);

  return runCallTransition(ctx, {
    callTarget: { roomId, roomLabel },
    responseRoomId: roomId ?? null,
    responseRoomLabel: roomLabel ?? null,
  });
}

function handleCheckInRoom(ctx: TransitionContext): QueueVisitTransitionResponse | undefined {
  const { roomId, roomLabel } = roomFields(ctx.body.roomId, ctx.body.roomLabel);
  const waitingRoomArrival = roomId === PF_FLOW_LOC_WAITING;
  const actingRoomId = waitingRoomArrival ? PF_FLOW_LOC_WAITING : ctx.body.actingRoomId?.trim();

  return runCheckInRoomTransition(ctx, {
    roomId,
    roomLabel,
    actingRoomId,
    // This reserved destination confirms an escorted arrival in the waiting room.
    // Pass it as actingRoomId so the Core rejects a Visit whose real target differs.
    explicitPlacement: Boolean(roomId && !waitingRoomArrival),
  });
}

function handleStartTreatment(ctx: TransitionContext): QueueVisitTransitionResponse | undefined {
  const actingRoomId = ctx.body.actingRoomId?.trim();
  return runVisitTransition({
    reply: ctx.reply,
    visitId: ctx.visitId,
    execute: () => ctx.db.startTreatment(ctx.visitId, actingRoomId, ctx.actorId),
    mapSuccess: (transition) => transitionBody(transition, ctx.visitId),
    errorOptions: {
      invalidTransitionMessage: `Ticket ${ctx.visitId} kann nicht gestartet werden.`,
      roomScopeMismatchMessage:
        'Start nur im aktuell zugewiesenen Raum möglich — bitte am richtigen Raum-Panel oder MFA nutzen.',
    },
  });
}

function handleContinueJourney(ctx: TransitionContext): QueueVisitTransitionResponse | undefined {
  const { roomId, roomLabel } = roomFields(ctx.body.roomId, ctx.body.roomLabel);
  return runVisitTransition({
    reply: ctx.reply,
    visitId: ctx.visitId,
    execute: () => ctx.db.continueJourney(ctx.visitId, roomId, roomLabel, ctx.actorId),
    mapSuccess: (transition) => ({
      ...transitionBody(transition, ctx.visitId),
      roomId: roomId ?? null,
      roomLabel: roomLabel ?? null,
    }),
    errorOptions: {
      invalidTransitionMessage: `Ticket ${ctx.visitId} kann nicht zum nächsten Journey-Schritt weitergeleitet werden.`,
      roomRequiredMessage: 'Bitte ein gültiges Aufrufziel angeben.',
      roomAtCapacityMessage,
    },
  });
}

function handleReassignRoom(ctx: TransitionContext): QueueVisitTransitionResponse | undefined {
  // Reassign ≠ Redirect — siehe Kommentar an reassignVisitRoom (visit-queue-bridge).
  const { roomId, roomLabel } = roomFields(ctx.body.roomId, ctx.body.roomLabel);
  if (!roomId) {
    sendApiError(ctx.reply, 400, {
      code: 'INVALID_ARGUMENT',
      message: 'Bitte ein gültiges Aufrufziel angeben.',
    });
    return undefined;
  }

  return runVisitTransition({
    reply: ctx.reply,
    visitId: ctx.visitId,
    execute: () => ctx.db.reassignRoom(ctx.visitId, roomId, roomLabel, ctx.actorId),
    mapSuccess: (transition) => ({
      ...transitionBody(transition, ctx.visitId),
      roomId: roomId ?? null,
      roomLabel: roomLabel ?? null,
    }),
    errorOptions: {
      invalidTransitionMessage: `Ticket ${ctx.visitId} kann im aktuellen Routing nicht umgeleitet werden.`,
      roomRequiredMessage: 'Bitte ein gültiges Aufrufziel angeben.',
      roomAtCapacityMessage,
    },
  });
}

function handleCheckOutRoom(ctx: TransitionContext): QueueVisitTransitionResponse | undefined {
  const actingRoomId = ctx.body.actingRoomId?.trim();
  return runCheckOutRoomTransition(ctx, { actingRoomId });
}

function handleCancel(ctx: TransitionContext): QueueVisitTransitionResponse | undefined {
  return runVisitTransition({
    reply: ctx.reply,
    visitId: ctx.visitId,
    execute: () => ctx.db.cancelQueueVisit(ctx.visitId, ctx.actorId),
    mapSuccess: (transition) => transitionBody(transition, ctx.visitId),
    errorOptions: {
      invalidTransitionMessage: `Ticket ${ctx.visitId} kann nicht gelöscht werden.`,
    },
  });
}

function handleReturnToWaiting(ctx: TransitionContext): QueueVisitTransitionResponse | undefined {
  return runVisitTransition({
    reply: ctx.reply,
    visitId: ctx.visitId,
    execute: () => ctx.db.returnToWaiting(ctx.visitId, ctx.actorId),
    mapSuccess: (transition) => transitionBody(transition, ctx.visitId),
    errorOptions: {
      invalidTransitionMessage: `Ticket ${ctx.visitId} kann nicht ins Wartezimmer zurueck.`,
    },
  });
}

function handleCycleTriage(ctx: TransitionContext): QueueVisitTransitionResponse | undefined {
  try {
    const result = ctx.db.cycleTriage(ctx.visitId);
    return {
      resultType: 'triage',
      visitId: ctx.visitId,
      triageLevel: result.triageLevel,
      updatedAt: result.updatedAt,
    };
  } catch (error) {
    const handled = handleQueueRouteError(ctx.reply, ctx.visitId, error, {
      invalidTransitionMessage: `Fuer Ticket ${ctx.visitId} kann keine Markierung gesetzt werden.`,
    });
    if (handled) {
      return undefined;
    }
    throw error;
  }
}

function handleSetAbsence(ctx: TransitionContext): QueueVisitTransitionResponse | undefined {
  if (!ctx.body.mode) {
    sendApiError(ctx.reply, 400, {
      code: 'INVALID_ARGUMENT',
      message: 'Abwesenheitsmodus ist erforderlich.',
    });
    return undefined;
  }
  if (ctx.body.callbackPhone?.trim() && ctx.body.recallConsentConfirmed !== true) {
    sendApiError(ctx.reply, 400, {
      code: 'INVALID_ARGUMENT',
      message: 'Bitte die mündliche Zustimmung zur Rückholbenachrichtigung bestätigen.',
    });
    return undefined;
  }
  const absenceMode = ctx.body.mode;
  return runVisitTransition({
    reply: ctx.reply,
    visitId: ctx.visitId,
    execute: () =>
      ctx.db.setAbsence(
        ctx.visitId,
        absenceMode,
        ctx.body.callbackPhone !== undefined
          ? {
              callbackPhone: ctx.body.callbackPhone,
              recallConsentConfirmed: ctx.body.recallConsentConfirmed === true,
              actorId: ctx.actorId,
            }
          : undefined,
      ),
    mapSuccess: (transition) => transitionBody(transition, ctx.visitId),
    errorOptions: {
      invalidTransitionMessage: `Ticket ${ctx.visitId} kann nicht als abwesend markiert werden.`,
    },
  });
}

async function handleRecall(
  ctx: TransitionContext,
): Promise<QueueVisitTransitionResponse | undefined> {
  const notifyChannel = ctx.body.notifyChannel ?? 'whatsapp';
  try {
    const transition = ctx.db.recallVisit(ctx.visitId, ctx.body.returnWindowMinutes);
    let smsDispatch: MessageDispatchResult | null = null;
    if (transition.callbackPhone) {
      smsDispatch = await dispatchRecallNotifyAndPersist(
        ctx.db,
        ctx.visitId,
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
      visitId: ctx.visitId,
      fromStatus: transition.fromStatus,
      toStatus: transition.toStatus,
      updatedAt: new Date().toISOString(),
      returnUntil: transition.returnUntil,
      smsDispatch,
    };
  } catch (error) {
    const handled = handleQueueRouteError(ctx.reply, ctx.visitId, error, {
      invalidTransitionMessage: `Ticket ${ctx.visitId} kann nicht zurueckgeholt werden.`,
      missingCallbackPhoneMessage: 'Rueckholbenachrichtigung nicht moeglich: callbackPhone fehlt.',
    });
    if (handled) {
      return undefined;
    }
    throw error;
  }
}

async function handleRetryRecallNotify(
  ctx: TransitionContext,
): Promise<QueueVisitTransitionResponse | undefined> {
  const notifyChannel = ctx.body.notifyChannel ?? 'whatsapp';
  try {
    const retry = ctx.db.retryRecallNotify(ctx.visitId);
    const smsDispatch = await dispatchRecallNotifyAndPersist(
      ctx.db,
      ctx.visitId,
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
      visitId: ctx.visitId,
      returnUntil: retry.returnUntil,
      recallNotifyErrorCode: smsDispatch.sent ? null : (smsDispatch.errorCode ?? 'UNKNOWN'),
      smsDispatch,
    };
  } catch (error) {
    const handled = handleQueueRouteError(ctx.reply, ctx.visitId, error, {
      invalidTransitionMessage: `Ticket ${ctx.visitId} kann keine Rückholbenachrichtigung erneut senden.`,
      missingCallbackPhoneMessage:
        'Fuer eine erneute Benachrichtigung ist eine Handynummer erforderlich.',
      recallNotifyRetryNotAllowedMessage:
        'Eine erneute Benachrichtigung ist fuer dieses Ticket nicht moeglich.',
      recallWindowExpiredMessage:
        'Das Rueckkehrfenster ist abgelaufen — erneute Benachrichtigung nicht moeglich.',
    });
    if (handled) {
      return undefined;
    }
    throw error;
  }
}

type StaffTransitionHandler = (
  ctx: TransitionContext,
) => QueueVisitTransitionResponse | undefined | Promise<QueueVisitTransitionResponse | undefined>;

const staffTransitionHandlers: Record<QueueVisitTransitionBody['type'], StaffTransitionHandler> = {
  call: handleCall,
  check_in_room: handleCheckInRoom,
  start_treatment: handleStartTreatment,
  continue_journey: handleContinueJourney,
  reassign_room: handleReassignRoom,
  check_out_room: handleCheckOutRoom,
  cancel: handleCancel,
  return_to_waiting: handleReturnToWaiting,
  cycle_triage: handleCycleTriage,
  set_absence: handleSetAbsence,
  recall: handleRecall,
  retry_recall_notify: handleRetryRecallNotify,
};

async function applyStaffQueueVisitTransition(
  db: CoreDatabase,
  reply: QueueReply,
  visitId: string,
  body: QueueVisitTransitionBody,
  actorId?: string,
): Promise<QueueVisitTransitionResponse | undefined> {
  const handler = staffTransitionHandlers[body.type];
  if (!handler) {
    sendApiError(reply, 400, {
      code: 'INVALID_ARGUMENT',
      message: 'Unbekannte Ticket-Aktion.',
    });
    return undefined;
  }
  return handler({ db, reply, visitId, body, actorId });
}

async function applyRoomPanelQueueVisitTransition(
  db: CoreDatabase,
  reply: QueueReply,
  visitId: string,
  body: QueueVisitTransitionBody,
  session: RoomPanelGrant,
): Promise<QueueVisitTransitionResponse | undefined> {
  const activePanel = resolveRoomPanelForSession(db, session);
  if (!activePanel) {
    sendApiError(reply, 403, {
      code: 'AUTH_FORBIDDEN',
      message: 'Raum-Panel ist deaktiviert oder die Platzierung wurde geändert.',
    });
    return undefined;
  }

  const { capabilities } = resolveRoomPanelSnapshotPolicy(activePanel);
  const ctx: TransitionRunnerContext = { db, reply, visitId, actorId: session.sessionId };

  switch (body.type) {
    case 'call': {
      if (!capabilities.canCall) {
        sendApiError(reply, 403, {
          code: 'AUTH_FORBIDDEN',
          message:
            activePanel.placement === 'outside'
              ? 'Raum-Panel darf diese Ticket-Aktion nicht ausfuehren.'
              : 'Patienten aufrufen ist für dieses Raum-Panel nicht aktiviert.',
        });
        return undefined;
      }

      return runCallTransition(ctx, {
        responseRoomId: session.roomId,
        responseRoomLabel: activePanel.room.roomLabel?.trim() || null,
        beforeExecute: () => assertRoomPanelCallVisitScope(db, visitId, session.roomId),
        roomScopeMismatchMessage: panelCallScopeMismatchMessage,
      });
    }
    case 'check_in_room': {
      if (!capabilities.canCheckIn) {
        sendApiError(reply, 403, {
          code: 'AUTH_FORBIDDEN',
          message: 'Ankunftsbestätigung ist für dieses Raum-Panel nicht aktiviert.',
        });
        return undefined;
      }

      return runCheckInRoomTransition(ctx, {
        actingRoomId: session.roomId,
        responseRoomId: session.roomId,
        responseRoomLabel: null,
      });
    }
    case 'check_out_room': {
      if (!capabilities.canCheckOut) {
        sendApiError(reply, 403, {
          code: 'AUTH_FORBIDDEN',
          message: 'Check-out ist nur im Raum-Panel-Modus staff_full erlaubt.',
        });
        return undefined;
      }

      return runCheckOutRoomTransition(ctx, { actingRoomId: session.roomId });
    }
    default:
      sendApiError(reply, 403, {
        code: 'AUTH_FORBIDDEN',
        message: 'Raum-Panel darf diese Ticket-Aktion nicht ausfuehren.',
      });
      return undefined;
  }
}

export function buildQueueTransitionResponse(
  transition: StatusTransition,
  visitId: string,
): ReturnType<typeof transitionBody> {
  return transitionBody(transition, visitId);
}

export async function applyQueueVisitTransition(
  db: CoreDatabase,
  reply: FastifyReply,
  visitId: string,
  body: QueueVisitTransitionBody,
  authSession?: AuthSession,
): Promise<QueueVisitTransitionResponse | undefined> {
  if (authSession?.kind === 'room-panel') {
    return applyRoomPanelQueueVisitTransition(db, reply, visitId, body, authSession);
  }

  return applyStaffQueueVisitTransition(db, reply, visitId, body, authSession?.sessionId);
}
