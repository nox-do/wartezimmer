import { mfaPracticeContext, getMfaCallRoomOverride } from '$lib/mfa/mfa-practice-context.svelte';
import { applyMfaQueueTriageLevel, mfaQueueDisplay } from '$lib/mfa/mfa-queue-display.svelte';
import { isQueueCallAnnouncementReachable } from '$lib/queue/call-announcement';
import { resolveCallRoomTarget } from '$lib/queue/call-room-target';
import { roomHasCapacity } from '$lib/queue/room-capacity';
import { formatClockTime } from '$lib/queue/format-time';
import { formatTicketCode } from '@praxis-flow/domain';
import {
  callTicket,
  checkInTicket,
  checkOutTicket,
  cycleTriageTicket,
  recallTicket,
  retryRecallNotifyTicket,
  reassignRoomTicket,
  returnTicketToWaiting,
  setAbsenceTicket,
  setCallbackPhoneTicket,
  clearCallbackPhoneTicket,
} from '$lib/queue/queue-actions';
import { getQueueZone } from '$lib/queue/queue-zones';
import {
  queueDragSourceFromItem,
  resolveQueueDrop,
  type QueueDropTarget,
} from '$lib/queue/queue-drop-resolver';
import { resolveRoomTargetForCheckIn } from '$lib/queue/room-target';
import { t, tf } from '$lib/i18n/i18nStore.svelte';
import { toastStore } from '$lib/stores/toastStore';
import { resolveRecallDispatchErrorKey } from '$lib/mfa/recall-dispatch-error';
import { returnCountdownRemainingMs } from '$lib/queue/format-return-countdown';
import type { Result } from '$lib/types/result';

export type MarkAwayTicket = {
  ticketId: string;
  laneCode: string;
  number: number;
  initialPhone: string;
  /** Set after set-absence succeeded so a failed callback PUT can be retried. */
  absenceConfirmed: boolean;
};

export type ReassignTicket = {
  ticketId: string;
  laneCode: string;
  number: number;
  roomId?: string | null;
};

export type CheckOutTicket = {
  ticketId: string;
  laneCode: string;
  number: number;
};

export const mfaQueueActions = $state({
  busyTicketId: null as string | null,
  markAwayTicket: null as MarkAwayTicket | null,
  fixRecallNotifyTicket: null as MarkAwayTicket | null,
  reassignTicket: null as ReassignTicket | null,
  checkOutTicket: null as CheckOutTicket | null,
});

export function resetMfaQueueActions() {
  mfaQueueActions.busyTicketId = null;
  mfaQueueActions.markAwayTicket = null;
  mfaQueueActions.fixRecallNotifyTicket = null;
  mfaQueueActions.reassignTicket = null;
  mfaQueueActions.checkOutTicket = null;
}

function queueItem(ticketId: string) {
  return mfaQueueDisplay.queue?.items.find((item) => item.ticketId === ticketId);
}

function queueItems() {
  return mfaQueueDisplay.queue?.items ?? [];
}

function ensureRoomCapacity(roomId: string, excludeTicketId?: string): boolean {
  if (roomHasCapacity(mfaPracticeContext.practiceRooms, queueItems(), roomId, excludeTicketId)) {
    return true;
  }
  toastStore.error(t('mfa.roomAtCapacity'));
  return false;
}

export async function runMfaQueueAction<T>(ticketId: string, action: () => Promise<Result<T>>) {
  mfaQueueActions.busyTicketId = ticketId;
  const result = await action();
  mfaQueueActions.busyTicketId = null;

  if (!result.ok) {
    toastStore.error(result.error.message);
  }
  return result;
}

export function handleMfaReassign(ticketId: string) {
  const item = queueItem(ticketId);
  if (!item) {
    return;
  }

  mfaQueueActions.reassignTicket = {
    ticketId: item.ticketId,
    laneCode: item.laneCode,
    number: item.number,
    roomId: item.roomId,
  };
}

export function cancelMfaReassign() {
  mfaQueueActions.reassignTicket = null;
}

export async function confirmMfaReassign(roomId: string, roomLabel: string) {
  const ticketId = mfaQueueActions.reassignTicket?.ticketId;
  if (!ticketId) {
    return;
  }

  await runMfaQueueAction(ticketId, () => reassignRoomTicket(ticketId, { roomId, roomLabel }));
  mfaQueueActions.reassignTicket = null;
}

export function handleMfaMarkAway(ticketId: string) {
  const item = queueItem(ticketId);
  if (!item) {
    return;
  }

  const initialPhone = item.callbackPhone?.trim() || item.checkinPhone?.trim() || '';

  mfaQueueActions.markAwayTicket = {
    ticketId: item.ticketId,
    laneCode: item.laneCode,
    number: item.number,
    initialPhone,
    absenceConfirmed: false,
  };
}

export function cancelMfaMarkAway() {
  mfaQueueActions.markAwayTicket = null;
}

export async function confirmMfaMarkAwayWithPhone(phoneNumber: string) {
  const markAway = mfaQueueActions.markAwayTicket;
  if (!markAway) {
    return;
  }

  const { ticketId } = markAway;
  const trimmedPhone = phoneNumber.trim();
  mfaQueueActions.busyTicketId = ticketId;

  if (!markAway.absenceConfirmed) {
    const result = await setAbsenceTicket(ticketId, 'wait_here');
    if (!result.ok) {
      const alreadyAway = queueItem(ticketId)?.status === 'absent_wait_here';
      if (!alreadyAway) {
        mfaQueueActions.busyTicketId = null;
        toastStore.error(result.error.message);
        return;
      }
    }
    mfaQueueActions.markAwayTicket = { ...markAway, absenceConfirmed: true };
  }

  if (trimmedPhone.length > 0) {
    const phoneResult = await setCallbackPhoneTicket(ticketId, trimmedPhone);
    if (!phoneResult.ok) {
      mfaQueueActions.busyTicketId = null;
      toastStore.error(phoneResult.error.message);
      return;
    }
  }

  mfaQueueActions.busyTicketId = null;
  mfaQueueActions.markAwayTicket = null;
  toastStore.success(t('mfa.markAwaySuccess'));
}

type RecallSmsDispatch = {
  attempted?: boolean;
  sent?: boolean;
  errorCode?: string;
} | null;

function showRecallSmsFailureToast(
  ticketId: string,
  dispatch: RecallSmsDispatch,
  item?: { laneCode: string; number: number },
) {
  if (!dispatch || dispatch.sent) {
    return;
  }

  const ticketLabel = item != null ? formatTicketCode(item.laneCode, item.number) : ticketId;
  const errorKey = resolveRecallDispatchErrorKey(dispatch.errorCode);
  const errorMessage =
    errorKey === 'mfa.recallSmsErrorGeneric'
      ? tf('mfa.recallSmsErrorGeneric', { code: dispatch.errorCode?.trim() || 'UNKNOWN' })
      : t(errorKey);

  toastStore.persistent(errorMessage, {
    title: tf('mfa.recallSmsFailedTitle', { ticket: ticketLabel }),
    type: 'warning',
  });
}

export function handleMfaFixRecallNotify(ticketId: string) {
  const item = queueItem(ticketId);
  if (!item?.recallNotifyErrorCode) {
    return;
  }
  if (item.returnUntil && returnCountdownRemainingMs(item.returnUntil) <= 0) {
    return;
  }

  const initialPhone = item.callbackPhone?.trim() || item.checkinPhone?.trim() || '';

  mfaQueueActions.fixRecallNotifyTicket = {
    ticketId: item.ticketId,
    laneCode: item.laneCode,
    number: item.number,
    initialPhone,
    absenceConfirmed: false,
  };
}

export function cancelMfaFixRecallNotify() {
  mfaQueueActions.fixRecallNotifyTicket = null;
}

export async function confirmMfaFixRecallNotifyWithPhone(phoneNumber: string) {
  if (!mfaQueueActions.fixRecallNotifyTicket) {
    return;
  }

  const { ticketId, laneCode, number } = mfaQueueActions.fixRecallNotifyTicket;
  const trimmedPhone = phoneNumber.trim();
  const storedCallback = queueItem(ticketId)?.callbackPhone?.trim() ?? '';
  mfaQueueActions.busyTicketId = ticketId;

  if (trimmedPhone.length > 0) {
    const phoneResult = await setCallbackPhoneTicket(ticketId, trimmedPhone);
    if (!phoneResult.ok) {
      mfaQueueActions.busyTicketId = null;
      toastStore.error(phoneResult.error.message);
      return;
    }
  } else if (storedCallback.length > 0) {
    const clearResult = await clearCallbackPhoneTicket(ticketId);
    if (!clearResult.ok) {
      mfaQueueActions.busyTicketId = null;
      toastStore.error(clearResult.error.message);
      return;
    }
  }

  const result = await retryRecallNotifyTicket(ticketId);
  mfaQueueActions.busyTicketId = null;

  if (!result.ok) {
    toastStore.error(result.error.message);
    return;
  }

  mfaQueueActions.fixRecallNotifyTicket = null;

  if (result.data.smsDispatch.sent) {
    toastStore.success(t('mfa.recallNotifyRetrySuccess'));
    return;
  }

  showRecallSmsFailureToast(ticketId, result.data.smsDispatch, { laneCode, number });
}

export async function handleMfaRecall(ticketId: string) {
  const item = queueItem(ticketId);
  mfaQueueActions.busyTicketId = ticketId;
  const result = await recallTicket(ticketId);
  mfaQueueActions.busyTicketId = null;

  if (!result.ok) {
    toastStore.error(result.error.message);
    return;
  }

  toastStore.success(tf('mfa.recallStarted', { time: formatClockTime(result.data.returnUntil) }));
  showRecallSmsFailureToast(ticketId, result.data.smsDispatch, item ?? undefined);
}

export function callMfaTicket(ticketId: string) {
  if (!isQueueCallAnnouncementReachable()) {
    toastStore.error(t('mfa.callAnnouncementOffline'));
    return Promise.resolve();
  }

  const room = resolveCallRoomTarget(queueItem(ticketId), getMfaCallRoomOverride());
  if (room && !ensureRoomCapacity(room.roomId)) {
    return Promise.resolve();
  }

  return runMfaQueueAction(ticketId, () => callTicket(ticketId, room));
}

export function checkInMfaTicket(ticketId: string) {
  const target = resolveRoomTargetForCheckIn(queueItem(ticketId), getMfaCallRoomOverride());
  if (target?.roomId && !ensureRoomCapacity(target.roomId, ticketId)) {
    return Promise.resolve();
  }

  return runMfaQueueAction(ticketId, () => checkInTicket(ticketId, target));
}

export function cycleMfaTriage(ticketId: string) {
  return runMfaQueueAction(ticketId, async () => {
    const result = await cycleTriageTicket(ticketId);
    if (result.ok) {
      applyMfaQueueTriageLevel(ticketId, result.data.triageLevel ?? null);
    }
    return result;
  });
}

export function handleMfaCheckOut(ticketId: string) {
  const item = queueItem(ticketId);
  if (!item) {
    return;
  }

  mfaQueueActions.checkOutTicket = {
    ticketId: item.ticketId,
    laneCode: item.laneCode,
    number: item.number,
  };
}

export function cancelMfaCheckOut() {
  mfaQueueActions.checkOutTicket = null;
}

export async function confirmMfaCheckOut() {
  const ticketId = mfaQueueActions.checkOutTicket?.ticketId;
  if (!ticketId) {
    return;
  }

  await runMfaQueueAction(ticketId, () => checkOutTicket(ticketId));
  mfaQueueActions.checkOutTicket = null;
}

export function returnMfaTicketToWaiting(ticketId: string) {
  return runMfaQueueAction(ticketId, () => returnTicketToWaiting(ticketId));
}

export function handleMfaQueueDrop(ticketId: string, target: QueueDropTarget) {
  const item = queueItem(ticketId);
  if (!item) {
    return;
  }

  const zone = getQueueZone(item.status);
  if (zone !== 'waiting' && zone !== 'active') {
    return;
  }

  const source = queueDragSourceFromItem(item, zone === 'waiting' ? 'waiting' : 'active');
  const command = resolveQueueDrop(source, target);
  if (!command) {
    return;
  }

  if (command.action === 'call') {
    if (!isQueueCallAnnouncementReachable()) {
      toastStore.error(t('mfa.callAnnouncementOffline'));
      return;
    }
    if (!ensureRoomCapacity(command.room.roomId)) {
      return;
    }
    void runMfaQueueAction(command.ticketId, () => callTicket(command.ticketId, command.room));
    return;
  }

  if (command.action === 'reassign') {
    if (!ensureRoomCapacity(command.room.roomId, command.ticketId)) {
      return;
    }
    void runMfaQueueAction(command.ticketId, () =>
      reassignRoomTicket(command.ticketId, command.room),
    );
    return;
  }

  void runMfaQueueAction(command.ticketId, () => returnTicketToWaiting(command.ticketId));
}
