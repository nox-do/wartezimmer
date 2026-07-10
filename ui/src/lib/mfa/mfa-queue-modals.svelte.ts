import { mfaQueueDisplay } from '$lib/mfa/mfa-queue-display.svelte';
import { returnCountdownRemainingMs } from '$lib/queue/format-return-countdown';

export type PhoneCorrectionPurpose = 'markAway' | 'fixRecallNotify';

export type PhoneCorrectionTicket = {
  visitId: string;
  laneCode: string;
  number: number;
  initialPhone: string;
  purpose: PhoneCorrectionPurpose;
  /** Set after set-absence succeeded so a failed callback PUT can be retried (markAway only). */
  absenceConfirmed: boolean;
};

/** @deprecated Prefer PhoneCorrectionTicket — kept for call-site typing clarity. */
export type MarkAwayTicket = PhoneCorrectionTicket;

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
  phoneCorrectionVisit: null as PhoneCorrectionTicket | null,
  reassignVisit: null as ReassignTicket | null,
  checkOutVisit: null as CheckOutTicket | null,
});

export function resetMfaQueueActions() {
  mfaQueueActions.busyVisitId = null;
  mfaQueueActions.phoneCorrectionVisit = null;
  mfaQueueActions.reassignVisit = null;
  mfaQueueActions.checkOutVisit = null;
}

function queueItem(visitId: string) {
  return mfaQueueDisplay.queue?.items.find((item) => item.visitId === visitId);
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

export function handleMfaMarkAway(visitId: string) {
  const item = queueItem(visitId);
  if (!item) {
    return;
  }

  const initialPhone = item.callbackPhone?.trim() || item.checkinPhone?.trim() || '';

  mfaQueueActions.phoneCorrectionVisit = {
    visitId: item.visitId,
    laneCode: item.laneCode,
    number: item.number,
    initialPhone,
    purpose: 'markAway',
    absenceConfirmed: false,
  };
}

export function cancelMfaMarkAway() {
  if (mfaQueueActions.phoneCorrectionVisit?.purpose === 'markAway') {
    mfaQueueActions.phoneCorrectionVisit = null;
  }
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

  mfaQueueActions.phoneCorrectionVisit = {
    visitId: item.visitId,
    laneCode: item.laneCode,
    number: item.number,
    initialPhone,
    purpose: 'fixRecallNotify',
    absenceConfirmed: false,
  };
}

export function cancelMfaFixRecallNotify() {
  if (mfaQueueActions.phoneCorrectionVisit?.purpose === 'fixRecallNotify') {
    mfaQueueActions.phoneCorrectionVisit = null;
  }
}

export function cancelMfaPhoneCorrection() {
  mfaQueueActions.phoneCorrectionVisit = null;
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
