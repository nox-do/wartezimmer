import { mfaPracticeContext } from '$lib/mfa/mfa-practice-context.svelte';
import { applyMfaQueueTriageLevel, mfaQueueDisplay } from '$lib/mfa/mfa-queue-display.svelte';
import { isQueueCallAnnouncementReachable } from '$lib/queue/call-announcement';
import { resolveCallRoomTarget } from '$lib/queue/call-room-target';
import { roomHasCapacity } from '$lib/queue/room-capacity';
import { formatClockTime } from '$lib/queue/format-time';
import { formatTicketCode } from '@praxis-flow/domain';
import {
  callVisit,
  checkInVisit,
  checkOutVisit,
  cycleTriageVisit,
  recallVisit,
  retryRecallNotifyVisit,
  reassignRoomVisit,
  returnVisitToWaiting,
  setAbsenceVisit,
  setCallbackPhoneVisit,
  clearCallbackPhoneVisit,
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
  visitId: string;
  laneCode: string;
  number: number;
  initialPhone: string;
  /** Set after set-absence succeeded so a failed callback PUT can be retried. */
  absenceConfirmed: boolean;
};

export type ReassignTicket = {
  visitId: string;
  laneCode: string;
  number: number;
  roomId?: string | null;
};

export type CheckOutTicket = {
  visitId: string;
  laneCode: string;
  number: number;
};

export const mfaQueueActions = $state({
  busyVisitId: null as string | null,
  markAwayVisit: null as MarkAwayTicket | null,
  fixRecallNotifyVisit: null as MarkAwayTicket | null,
  reassignVisit: null as ReassignTicket | null,
  checkOutVisit: null as CheckOutTicket | null,
});

export function resetMfaQueueActions() {
  mfaQueueActions.busyVisitId = null;
  mfaQueueActions.markAwayVisit = null;
  mfaQueueActions.fixRecallNotifyVisit = null;
  mfaQueueActions.reassignVisit = null;
  mfaQueueActions.checkOutVisit = null;
}

function queueItem(visitId: string) {
  return mfaQueueDisplay.queue?.items.find((item) => item.visitId === visitId);
}

function queueItems() {
  return mfaQueueDisplay.queue?.items ?? [];
}

function ensureRoomCapacity(roomId: string, excludeVisitId?: string): boolean {
  if (roomHasCapacity(mfaPracticeContext.practiceRooms, queueItems(), roomId, excludeVisitId)) {
    return true;
  }
  toastStore.error(t('mfa.roomAtCapacity'));
  return false;
}

export async function runMfaQueueAction<T>(visitId: string, action: () => Promise<Result<T>>) {
  mfaQueueActions.busyVisitId = visitId;
  const result = await action();
  mfaQueueActions.busyVisitId = null;

  if (!result.ok) {
    toastStore.error(result.error.message);
  }
  return result;
}

export function handleMfaReassign(visitId: string) {
  const item = queueItem(visitId);
  if (!item) {
    return;
  }

  mfaQueueActions.reassignVisit = {
    visitId: item.visitId,
    laneCode: item.laneCode,
    number: item.number,
    roomId: item.roomId,
  };
}

export function cancelMfaReassign() {
  mfaQueueActions.reassignVisit = null;
}

export async function confirmMfaReassign(roomId: string, roomLabel: string) {
  const visitId = mfaQueueActions.reassignVisit?.visitId;
  if (!visitId) {
    return;
  }

  await runMfaQueueAction(visitId, () => reassignRoomVisit(visitId, { roomId, roomLabel }));
  mfaQueueActions.reassignVisit = null;
}

export function handleMfaMarkAway(visitId: string) {
  const item = queueItem(visitId);
  if (!item) {
    return;
  }

  const initialPhone = item.callbackPhone?.trim() || item.checkinPhone?.trim() || '';

  mfaQueueActions.markAwayVisit = {
    visitId: item.visitId,
    laneCode: item.laneCode,
    number: item.number,
    initialPhone,
    absenceConfirmed: false,
  };
}

export function cancelMfaMarkAway() {
  mfaQueueActions.markAwayVisit = null;
}

export async function confirmMfaMarkAwayWithPhone(phoneNumber: string) {
  const markAway = mfaQueueActions.markAwayVisit;
  if (!markAway) {
    return;
  }

  const { visitId } = markAway;
  const trimmedPhone = phoneNumber.trim();
  mfaQueueActions.busyVisitId = visitId;

  if (!markAway.absenceConfirmed) {
    const result = await setAbsenceVisit(visitId, 'wait_here');
    if (!result.ok) {
      const alreadyAway = queueItem(visitId)?.status === 'absent_wait_here';
      if (!alreadyAway) {
        mfaQueueActions.busyVisitId = null;
        toastStore.error(result.error.message);
        return;
      }
    }
    mfaQueueActions.markAwayVisit = { ...markAway, absenceConfirmed: true };
  }

  if (trimmedPhone.length > 0) {
    const phoneResult = await setCallbackPhoneVisit(visitId, trimmedPhone);
    if (!phoneResult.ok) {
      mfaQueueActions.busyVisitId = null;
      toastStore.error(phoneResult.error.message);
      return;
    }
  }

  mfaQueueActions.busyVisitId = null;
  mfaQueueActions.markAwayVisit = null;
  toastStore.success(t('mfa.markAwaySuccess'));
}

type RecallSmsDispatch = {
  attempted?: boolean;
  sent?: boolean;
  errorCode?: string;
} | null;

function showRecallSmsFailureToast(
  visitId: string,
  dispatch: RecallSmsDispatch,
  item?: { laneCode: string; number: number },
) {
  if (!dispatch || dispatch.sent) {
    return;
  }

  const ticketLabel = item != null ? formatTicketCode(item.laneCode, item.number) : visitId;
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

export function handleMfaFixRecallNotify(visitId: string) {
  const item = queueItem(visitId);
  if (!item?.recallNotifyErrorCode) {
    return;
  }
  if (item.returnUntil && returnCountdownRemainingMs(item.returnUntil) <= 0) {
    return;
  }

  const initialPhone = item.callbackPhone?.trim() || item.checkinPhone?.trim() || '';

  mfaQueueActions.fixRecallNotifyVisit = {
    visitId: item.visitId,
    laneCode: item.laneCode,
    number: item.number,
    initialPhone,
    absenceConfirmed: false,
  };
}

export function cancelMfaFixRecallNotify() {
  mfaQueueActions.fixRecallNotifyVisit = null;
}

export async function confirmMfaFixRecallNotifyWithPhone(phoneNumber: string) {
  if (!mfaQueueActions.fixRecallNotifyVisit) {
    return;
  }

  const { visitId, laneCode, number } = mfaQueueActions.fixRecallNotifyVisit;
  const trimmedPhone = phoneNumber.trim();
  const storedCallback = queueItem(visitId)?.callbackPhone?.trim() ?? '';
  mfaQueueActions.busyVisitId = visitId;

  if (trimmedPhone.length > 0) {
    const phoneResult = await setCallbackPhoneVisit(visitId, trimmedPhone);
    if (!phoneResult.ok) {
      mfaQueueActions.busyVisitId = null;
      toastStore.error(phoneResult.error.message);
      return;
    }
  } else if (storedCallback.length > 0) {
    const clearResult = await clearCallbackPhoneVisit(visitId);
    if (!clearResult.ok) {
      mfaQueueActions.busyVisitId = null;
      toastStore.error(clearResult.error.message);
      return;
    }
  }

  const result = await retryRecallNotifyVisit(visitId);
  mfaQueueActions.busyVisitId = null;

  if (!result.ok) {
    toastStore.error(result.error.message);
    return;
  }

  mfaQueueActions.fixRecallNotifyVisit = null;

  if (result.data.smsDispatch.sent) {
    toastStore.success(t('mfa.recallNotifyRetrySuccess'));
    return;
  }

  showRecallSmsFailureToast(visitId, result.data.smsDispatch, { laneCode, number });
}

export async function handleMfaRecall(visitId: string) {
  const item = queueItem(visitId);
  mfaQueueActions.busyVisitId = visitId;
  const result = await recallVisit(visitId);
  mfaQueueActions.busyVisitId = null;

  if (!result.ok) {
    toastStore.error(result.error.message);
    return;
  }

  toastStore.success(tf('mfa.recallStarted', { time: formatClockTime(result.data.returnUntil) }));
  showRecallSmsFailureToast(visitId, result.data.smsDispatch, item ?? undefined);
}

export function callMfaTicket(visitId: string) {
  if (!isQueueCallAnnouncementReachable()) {
    toastStore.error(t('mfa.callAnnouncementOffline'));
    return Promise.resolve();
  }

  const room = resolveCallRoomTarget(queueItem(visitId));
  if (room && !ensureRoomCapacity(room.roomId)) {
    return Promise.resolve();
  }

  return runMfaQueueAction(visitId, () => callVisit(visitId, room));
}

export function checkInMfaTicket(visitId: string) {
  const target = resolveRoomTargetForCheckIn(queueItem(visitId));
  if (target?.roomId && !ensureRoomCapacity(target.roomId, visitId)) {
    return Promise.resolve();
  }

  return runMfaQueueAction(visitId, () => checkInVisit(visitId, target));
}

export function cycleMfaTriage(visitId: string) {
  return runMfaQueueAction(visitId, async () => {
    const result = await cycleTriageVisit(visitId);
    if (result.ok) {
      applyMfaQueueTriageLevel(visitId, result.data.triageLevel ?? null);
    }
    return result;
  });
}

export function handleMfaCheckOut(visitId: string) {
  const item = queueItem(visitId);
  if (!item) {
    return;
  }

  mfaQueueActions.checkOutVisit = {
    visitId: item.visitId,
    laneCode: item.laneCode,
    number: item.number,
  };
}

export function cancelMfaCheckOut() {
  mfaQueueActions.checkOutVisit = null;
}

export async function confirmMfaCheckOut() {
  const visitId = mfaQueueActions.checkOutVisit?.visitId;
  if (!visitId) {
    return;
  }

  await runMfaQueueAction(visitId, () => checkOutVisit(visitId));
  mfaQueueActions.checkOutVisit = null;
}

export function returnMfaTicketToWaiting(visitId: string) {
  return runMfaQueueAction(visitId, () => returnVisitToWaiting(visitId));
}

export function handleMfaQueueDrop(visitId: string, target: QueueDropTarget) {
  const item = queueItem(visitId);
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
    void runMfaQueueAction(command.visitId, () => callVisit(command.visitId, command.room));
    return;
  }

  if (command.action === 'reassign') {
    if (!ensureRoomCapacity(command.room.roomId, command.visitId)) {
      return;
    }
    void runMfaQueueAction(command.visitId, () =>
      reassignRoomVisit(command.visitId, command.room),
    );
    return;
  }

  void runMfaQueueAction(command.visitId, () => returnVisitToWaiting(command.visitId));
}
