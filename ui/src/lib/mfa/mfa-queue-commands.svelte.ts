import { mfaPracticeContext } from '$lib/mfa/mfa-practice-context.svelte';
import { applyMfaQueueTriageLevel, mfaQueueDisplay } from '$lib/mfa/mfa-queue-display.svelte';
import {
  cancelMfaPhoneCorrection,
  handleMfaMarkAway,
  mfaQueueActions,
} from '$lib/mfa/mfa-queue-modals.svelte';
import { resolveCallRoomTarget } from '$lib/queue/call-room-target';
import { roomHasCapacity } from '$lib/queue/room-capacity';
import { formatClockTime } from '$lib/queue/format-time';
import { formatTicketCode } from '@praxis-flow/domain';
import {
  callVisit,
  checkInVisit,
  checkOutVisit,
  cancelQueueVisit,
  continueJourneyVisit,
  cycleTriageVisit,
  recallVisit,
  retryRecallNotifyVisit,
  reassignRoomVisit,
  returnVisitToWaiting,
  setAbsenceVisit,
  setCallbackPhoneVisit,
  clearCallbackPhoneVisit,
  startTreatmentVisit,
} from '$lib/queue/queue-actions';
import { canMfaCallVisit } from '$lib/queue/mfa-call-gate';
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
import type { Result } from '$lib/types/result';

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

export async function confirmMfaReassign(roomId: string, roomLabel: string) {
  const visitId = mfaQueueActions.reassignVisit?.visitId;
  if (!visitId) {
    return;
  }

  await runMfaQueueAction(visitId, () => reassignRoomVisit(visitId, { roomId, roomLabel }));
  mfaQueueActions.reassignVisit = null;
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

async function confirmMarkAwayWithPhone(phoneNumber: string) {
  const markAway = mfaQueueActions.phoneCorrectionVisit;
  if (!markAway || markAway.purpose !== 'markAway') {
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
    mfaQueueActions.phoneCorrectionVisit = { ...markAway, absenceConfirmed: true };
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
  cancelMfaPhoneCorrection();
  toastStore.success(t('mfa.markAwaySuccess'));
}

async function confirmFixRecallNotifyWithPhone(phoneNumber: string) {
  const fixVisit = mfaQueueActions.phoneCorrectionVisit;
  if (!fixVisit || fixVisit.purpose !== 'fixRecallNotify') {
    return;
  }

  const { visitId, laneCode, number } = fixVisit;
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

  cancelMfaPhoneCorrection();

  if (result.data.smsDispatch.sent) {
    toastStore.success(t('mfa.recallNotifyRetrySuccess'));
    return;
  }

  showRecallSmsFailureToast(visitId, result.data.smsDispatch, { laneCode, number });
}

/** Unified phone-correction confirm — dispatches by `phoneCorrectionVisit.purpose`. */
export async function confirmMfaPhoneCorrection(phoneNumber: string) {
  const visit = mfaQueueActions.phoneCorrectionVisit;
  if (!visit) {
    return;
  }
  if (visit.purpose === 'fixRecallNotify') {
    await confirmFixRecallNotifyWithPhone(phoneNumber);
    return;
  }
  await confirmMarkAwayWithPhone(phoneNumber);
}

export async function confirmMfaMarkAwayWithPhone(phoneNumber: string) {
  await confirmMarkAwayWithPhone(phoneNumber);
}

export async function confirmMfaFixRecallNotifyWithPhone(phoneNumber: string) {
  await confirmFixRecallNotifyWithPhone(phoneNumber);
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
  // Call announcement reachability is server-authoritative (presence registry).
  // UI may warn via SSE status; do not pre-block the request here.
  const item = queueItem(visitId);
  if (!item || !canMfaCallVisit(item)) {
    return Promise.resolve();
  }
  const room = resolveCallRoomTarget(item);
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

export function startMfaTicket(visitId: string) {
  return runMfaQueueAction(visitId, () => startTreatmentVisit(visitId));
}

export function continueMfaJourney(visitId: string) {
  return runMfaQueueAction(visitId, () => continueJourneyVisit(visitId));
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

export async function confirmMfaCheckOut() {
  const pending = mfaQueueActions.checkOutVisit;
  if (!pending) {
    return;
  }

  const visitId = pending.visitId;
  await runMfaQueueAction(visitId, () =>
    pending.purpose === 'cancel' ? cancelQueueVisit(visitId) : checkOutVisit(visitId),
  );
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
    const dropItem = queueItem(command.visitId);
    if (!dropItem || !canMfaCallVisit(dropItem)) {
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
    void runMfaQueueAction(command.visitId, () => reassignRoomVisit(command.visitId, command.room));
    return;
  }

  if (command.action === 'mark-away') {
    handleMfaMarkAway(command.visitId);
    return;
  }

  void runMfaQueueAction(command.visitId, () => returnVisitToWaiting(command.visitId));
}
