import { cookieAuthFetch } from '$lib/api/cookie-auth-fetch';
import type {
  AbsenceMode,
  QueueCallbackPhoneResponse,
  QueueCallbackPhoneClearResponse,
  QueueIdentityRefResponse,
  QueueSupersedeResponse,
  QueueRecallResponse,
  QueueRecallRetryNotifyResponse,
  QueueVisitTransitionBody,
  QueueTransitionResponse,
  QueueTriageResponse,
} from './openapi-types';
import type { RoomTarget } from './room-target';

function visitPath(visitId: string, action: string): string {
  return `/api/v1/queue/${encodeURIComponent(visitId)}/${action}`;
}

function transitionVisit<T>(visitId: string, body: QueueVisitTransitionBody) {
  return cookieAuthFetch<T>(visitPath(visitId, 'transition'), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function roomActionBody(room?: RoomTarget) {
  return room != null
    ? {
        roomId: room.roomId,
        roomLabel: room.roomLabel,
      }
    : {};
}

export async function callVisit(visitId: string, room?: RoomTarget) {
  return transitionVisit<QueueTransitionResponse>(visitId, {
    type: 'call',
    ...roomActionBody(room),
  });
}

export async function checkInVisit(visitId: string, room?: RoomTarget) {
  return transitionVisit<QueueTransitionResponse>(visitId, {
    type: 'check_in_room',
    ...roomActionBody(room),
  });
}

export async function startTreatmentVisit(visitId: string) {
  return transitionVisit<QueueTransitionResponse>(visitId, { type: 'start_treatment' });
}

export async function continueJourneyVisit(visitId: string) {
  return transitionVisit<QueueTransitionResponse>(visitId, { type: 'continue_journey' });
}

export async function reassignRoomVisit(visitId: string, room: RoomTarget) {
  return transitionVisit<QueueTransitionResponse>(visitId, {
    type: 'reassign_room',
    roomId: room.roomId,
    roomLabel: room.roomLabel,
  });
}

export async function checkOutVisit(visitId: string) {
  return transitionVisit<QueueTransitionResponse>(visitId, { type: 'check_out_room' });
}

export async function cancelQueueVisit(visitId: string) {
  return transitionVisit<QueueTransitionResponse>(visitId, { type: 'cancel' });
}

export async function cycleTriageVisit(visitId: string) {
  return transitionVisit<QueueTriageResponse>(visitId, { type: 'cycle_triage' });
}

export async function returnVisitToWaiting(visitId: string) {
  return transitionVisit<QueueTransitionResponse>(visitId, { type: 'return_to_waiting' });
}

export async function recallVisit(visitId: string) {
  return transitionVisit<QueueRecallResponse>(visitId, { type: 'recall' });
}

export async function retryRecallNotifyVisit(visitId: string) {
  return transitionVisit<QueueRecallRetryNotifyResponse>(visitId, {
    type: 'retry_recall_notify',
  });
}

export async function clearCallbackPhoneVisit(visitId: string) {
  return cookieAuthFetch<QueueCallbackPhoneClearResponse>(visitPath(visitId, 'callback-phone'), {
    method: 'DELETE',
  });
}

export async function setCallbackPhoneVisit(visitId: string, callbackPhone: string) {
  return cookieAuthFetch<QueueCallbackPhoneResponse>(visitPath(visitId, 'callback-phone'), {
    method: 'PUT',
    body: JSON.stringify({ callbackPhone: callbackPhone.trim() }),
  });
}

export async function setIdentityRefVisit(visitId: string, identityRef: string) {
  return cookieAuthFetch<QueueIdentityRefResponse>(visitPath(visitId, 'identity-ref'), {
    method: 'PATCH',
    body: JSON.stringify({ identityRef: identityRef.trim() }),
  });
}

export async function supersedeVisitTopic(visitId: string, topicId: string) {
  return cookieAuthFetch<QueueSupersedeResponse>(visitPath(visitId, 'supersede'), {
    method: 'POST',
    body: JSON.stringify({ topicId }),
  });
}

export async function setAbsenceVisit(
  visitId: string,
  mode: Extract<AbsenceMode, 'wait_here' | 'return_later'> = 'wait_here',
) {
  return transitionVisit<QueueTransitionResponse>(visitId, { type: 'set_absence', mode });
}
