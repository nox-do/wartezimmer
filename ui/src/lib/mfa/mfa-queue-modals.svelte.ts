import { mfaQueueDisplay } from '$lib/mfa/mfa-queue-display.svelte';
import { returnCountdownRemainingMs } from '$lib/queue/format-return-countdown';

export type PhoneCorrectionPurpose = 'markAway' | 'fixRecallNotify';

export type PhoneCorrectionTicket = {
  visitId: string;
  laneCode: string;
  number: number;
  initialPhone: string;
  purpose: PhoneCorrectionPurpose;
};

export type ReassignTicket = {
  visitId: string;
  laneCode: string;
  number: number;
  roomId?: string | null;
};

export type SupersedeTicket = {
  visitId: string;
  laneCode: string;
  number: number;
  topicId: string;
  topicLabel: string;
};

export type CheckOutTicket = {
  visitId: string;
  laneCode: string;
  number: number;
  purpose: 'checkout' | 'cancel';
};

export type AssistancePlacementTicket = {
  visitId: string;
  laneCode: string;
  number: number;
  roomId: string;
  roomLabel: string;
};

export const mfaQueueActions = $state({
  busyVisitId: null as string | null,
  phoneCorrectionVisit: null as PhoneCorrectionTicket | null,
  reassignVisit: null as ReassignTicket | null,
  supersedeVisit: null as SupersedeTicket | null,
  checkOutVisit: null as CheckOutTicket | null,
  assistancePlacementVisit: null as AssistancePlacementTicket | null,
});

export function resetMfaQueueActions() {
  mfaQueueActions.busyVisitId = null;
  mfaQueueActions.phoneCorrectionVisit = null;
  mfaQueueActions.reassignVisit = null;
  mfaQueueActions.supersedeVisit = null;
  mfaQueueActions.checkOutVisit = null;
  mfaQueueActions.assistancePlacementVisit = null;
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

export function handleMfaSupersede(visitId: string) {
  const item = queueItem(visitId);
  if (!item) {
    return;
  }
  if (item.status !== 'waiting') {
    return;
  }
  mfaQueueActions.supersedeVisit = {
    visitId: item.visitId,
    laneCode: item.laneCode,
    number: item.number,
    topicId: item.topicId ?? '',
    topicLabel: item.topicLabel ?? '',
  };
}

export function cancelMfaSupersede() {
  mfaQueueActions.supersedeVisit = null;
}

export function handleMfaMarkAway(visitId: string) {
  const item = queueItem(visitId);
  if (!item || item.status !== 'waiting') {
    return;
  }

  const initialPhone = item.callbackPhone?.trim() || item.checkinPhone?.trim() || '';

  mfaQueueActions.phoneCorrectionVisit = {
    visitId: item.visitId,
    laneCode: item.laneCode,
    number: item.number,
    initialPhone,
    purpose: 'markAway',
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
    purpose: 'checkout',
  };
}

export function handleMfaCancelVisit(visitId: string) {
  const item = queueItem(visitId);
  if (!item) {
    return;
  }

  mfaQueueActions.checkOutVisit = {
    visitId: item.visitId,
    laneCode: item.laneCode,
    number: item.number,
    purpose: 'cancel',
  };
}

export function cancelMfaCheckOut() {
  mfaQueueActions.checkOutVisit = null;
}

export function openMfaAssistancePlacement(
  visitId: string,
  room: { roomId: string; roomLabel: string },
) {
  const item = queueItem(visitId);
  if (!item) {
    return;
  }
  mfaQueueActions.assistancePlacementVisit = {
    visitId: item.visitId,
    laneCode: item.laneCode,
    number: item.number,
    roomId: room.roomId,
    roomLabel: room.roomLabel,
  };
}

export function cancelMfaAssistancePlacement() {
  mfaQueueActions.assistancePlacementVisit = null;
}
