import { cookieAuthFetch } from '$lib/api/cookie-auth-fetch';
import type {
  AbsenceMode,
  QueueCallbackPhoneResponse,
  QueueCallbackPhoneClearResponse,
  QueueIdentityRefResponse,
  QueueRecallResponse,
  QueueRecallRetryNotifyResponse,
  QueueTicketTransitionBody,
  QueueTransitionResponse,
  QueueTriageResponse,
} from './openapi-types';
import type { RoomTarget } from './room-target';

function ticketPath(ticketId: string, action: string): string {
  return `/api/v1/queue/${encodeURIComponent(ticketId)}/${action}`;
}

function transitionTicket<T>(ticketId: string, body: QueueTicketTransitionBody) {
  return cookieAuthFetch<T>(ticketPath(ticketId, 'transition'), {
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

export async function callTicket(ticketId: string, room?: RoomTarget) {
  return transitionTicket<QueueTransitionResponse>(ticketId, {
    type: 'call',
    ...roomActionBody(room),
  });
}

export async function checkInTicket(ticketId: string, room?: RoomTarget) {
  return transitionTicket<QueueTransitionResponse>(ticketId, {
    type: 'check_in_room',
    ...roomActionBody(room),
  });
}

export async function reassignRoomTicket(ticketId: string, room: RoomTarget) {
  return transitionTicket<QueueTransitionResponse>(ticketId, {
    type: 'reassign_room',
    roomId: room.roomId,
    roomLabel: room.roomLabel,
  });
}

export async function checkOutTicket(ticketId: string) {
  return transitionTicket<QueueTransitionResponse>(ticketId, { type: 'check_out_room' });
}

export async function cycleTriageTicket(ticketId: string) {
  return transitionTicket<QueueTriageResponse>(ticketId, { type: 'cycle_triage' });
}

export async function returnTicketToWaiting(ticketId: string) {
  return transitionTicket<QueueTransitionResponse>(ticketId, { type: 'return_to_waiting' });
}

export async function recallTicket(ticketId: string) {
  return transitionTicket<QueueRecallResponse>(ticketId, { type: 'recall' });
}

export async function retryRecallNotifyTicket(ticketId: string) {
  return transitionTicket<QueueRecallRetryNotifyResponse>(ticketId, {
    type: 'retry_recall_notify',
  });
}

export async function clearCallbackPhoneTicket(ticketId: string) {
  return cookieAuthFetch<QueueCallbackPhoneClearResponse>(ticketPath(ticketId, 'callback-phone'), {
    method: 'DELETE',
  });
}

export async function setCallbackPhoneTicket(ticketId: string, callbackPhone: string) {
  return cookieAuthFetch<QueueCallbackPhoneResponse>(ticketPath(ticketId, 'callback-phone'), {
    method: 'PUT',
    body: JSON.stringify({ callbackPhone: callbackPhone.trim() }),
  });
}

export async function setIdentityRefTicket(ticketId: string, identityRef: string) {
  return cookieAuthFetch<QueueIdentityRefResponse>(ticketPath(ticketId, 'identity-ref'), {
    method: 'PATCH',
    body: JSON.stringify({ identityRef: identityRef.trim() }),
  });
}

export async function setAbsenceTicket(
  ticketId: string,
  mode: Extract<AbsenceMode, 'wait_here' | 'return_later'> = 'wait_here',
) {
  return transitionTicket<QueueTransitionResponse>(ticketId, { type: 'set_absence', mode });
}
