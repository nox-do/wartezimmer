import { isBackendUnreachable } from '$lib/api/backend-unreachable';
import { buildApiStreamUrl } from '$lib/api/build-api-url';
import { httpFetch } from '$lib/api/http-fetch';
import { roomPanelAuthFetch } from '$lib/api/cookie-auth-fetch';
import { SSE_CLIENT_ERROR, connectMultiEventSseStream } from '$lib/api/sse-client';
import { t } from '$lib/i18n/i18nStore.svelte';
import type {
  RoomPanelPlacement,
  RoomPanelRoom,
  RoomPanelRoomsResponse,
  RoomPanelSessionResponse,
} from '$lib/auth/openapi-types';
import type { QueueVisitTransitionResponse, RoomPanelSnapshot } from '$lib/queue/openapi-types';
import type { Result, SimpleResult } from '$lib/types/result';
import { isRoomPanelSessionExpiredError } from './room-panel-stream-error';

export type { RoomPanelRoom, RoomPanelRoomsResponse, RoomPanelSessionResponse };

export type RoomPanelStreamError = {
  message: string;
  backendUnreachable: boolean;
  sessionExpired: boolean;
};

export type RoomPanelStreamHandlers = {
  onSnapshot: (data: RoomPanelSnapshot) => void;
  onError?: (error: RoomPanelStreamError) => void;
};

export async function fetchRoomPanelRooms(): Promise<Result<RoomPanelRoomsResponse>> {
  return httpFetch<RoomPanelRoomsResponse>(
    '/api/v1/auth/room-panel/rooms',
    { method: 'GET', credentials: 'include' },
    { includeClientOriginHeader: true },
  );
}

export async function loginRoomPanel(input: {
  roomId: string;
  placement: RoomPanelPlacement;
  pin: string;
}): Promise<Result<RoomPanelSessionResponse>> {
  return httpFetch<RoomPanelSessionResponse>(
    '/api/v1/auth/room-panel/login',
    {
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({
        roomId: input.roomId,
        placement: input.placement,
        pin: input.pin,
      }),
    },
    { includeClientOriginHeader: true },
  );
}

export async function logoutRoomPanel(): Promise<SimpleResult> {
  return roomPanelAuthFetch<void>('/api/v1/auth/logout', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function fetchRoomPanelQueue(): Promise<Result<RoomPanelSnapshot>> {
  return roomPanelAuthFetch<RoomPanelSnapshot>('/api/v1/queue', { method: 'GET' });
}

function transitionRoomPanelVisit(
  visitId: string,
  type: 'check_in_room' | 'check_out_room' | 'call',
) {
  return roomPanelAuthFetch<QueueVisitTransitionResponse>(
    `/api/v1/queue/${encodeURIComponent(visitId)}/transition`,
    {
      method: 'POST',
      body: JSON.stringify({ type }),
    },
  );
}

export async function checkInRoomPanelVisit(visitId: string) {
  return transitionRoomPanelVisit(visitId, 'check_in_room');
}

export async function checkOutRoomPanelVisit(visitId: string) {
  return transitionRoomPanelVisit(visitId, 'check_out_room');
}

export async function callRoomPanelVisit(visitId: string) {
  return transitionRoomPanelVisit(visitId, 'call');
}

function resolveRoomPanelStreamError(message: string): RoomPanelStreamError {
  if (isRoomPanelSessionExpiredError(message)) {
    return {
      message: t('roomPanel.sessionExpired'),
      backendUnreachable: false,
      sessionExpired: true,
    };
  }
  if (message === SSE_CLIENT_ERROR.connectFailed) {
    return {
      message: t('roomPanel.streamError'),
      backendUnreachable: false,
      sessionExpired: false,
    };
  }
  if (isBackendUnreachable(message)) {
    return {
      message: t('mfa.backendUnreachableTitle'),
      backendUnreachable: true,
      sessionExpired: false,
    };
  }
  return { message, backendUnreachable: false, sessionExpired: false };
}

export function connectRoomPanelQueueStream(handlers: RoomPanelStreamHandlers): () => void {
  return connectMultiEventSseStream({
    url: buildApiStreamUrl('/api/v1/queue/stream'),
    credentials: 'include',
    includeClientOriginHeader: true,
    clientRole: 'room-panel',
    handlers: {
      snapshot: (data) => handlers.onSnapshot(data as RoomPanelSnapshot),
      'session-revoked': () =>
        handlers.onError?.(resolveRoomPanelStreamError(SSE_CLIENT_ERROR.unauthorized)),
    },
    onError: (message) => handlers.onError?.(resolveRoomPanelStreamError(message)),
  });
}
