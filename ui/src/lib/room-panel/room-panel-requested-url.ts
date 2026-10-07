import type { RoomPanelPlacement } from '@wartezimmer/domain';
import { buildApiUrl } from '$lib/api/build-api-url';

export type RoomPanelRequestedSession = {
  roomId: string;
  panel: {
    placement: RoomPanelPlacement;
  };
};

export type RoomPanelLoginEntry = {
  roomId: string;
  placement: RoomPanelPlacement;
};

export function readRequestedPlacementParam(placement: string): RoomPanelPlacement | '' {
  return placement === 'outside' || placement === 'inside' ? placement : '';
}

export function findRequestedRoomEntry<T extends RoomPanelLoginEntry>(
  rooms: T[],
  requestedRoomId: string,
  requestedPlacement = '',
): T | null {
  const roomId = requestedRoomId.trim();
  if (!roomId) {
    return null;
  }
  const placement = readRequestedPlacementParam(requestedPlacement);
  return (
    rooms.find((room) => room.roomId === roomId && (!placement || room.placement === placement)) ??
    null
  );
}

/** Relative deep-link path for same-origin navigation. */
export function buildRoomPanelPath(roomId: string, placement?: RoomPanelPlacement | ''): string {
  const params = new URLSearchParams({ room: roomId.trim() });
  const normalizedPlacement = placement ? readRequestedPlacementParam(placement) : '';
  if (normalizedPlacement) {
    params.set('placement', normalizedPlacement);
  }
  return `/room-panel?${params.toString()}`;
}

/** Absolute URL when `VITE_API_BASE` / canonical origin is configured; otherwise relative path. */
export function buildRoomPanelUrl(
  roomId: string,
  placement?: RoomPanelPlacement | '',
  baseUrl?: string,
): string {
  return buildApiUrl(buildRoomPanelPath(roomId, placement), baseUrl);
}

export function snapshotMatchesRequestedUrl(
  snapshot: RoomPanelRequestedSession,
  requestedRoomId: string,
  requestedPlacement: string,
): boolean {
  if (!requestedRoomId) {
    return true;
  }
  if (snapshot.roomId !== requestedRoomId) {
    return false;
  }
  const placement = readRequestedPlacementParam(requestedPlacement);
  if (placement && snapshot.panel.placement !== placement) {
    return false;
  }
  return true;
}

export function shouldReconcileRequestedUrl(
  snapshot: RoomPanelRequestedSession | null,
  requestedRoomId: string,
  requestedPlacement: string,
): boolean {
  if (!requestedRoomId) {
    return false;
  }
  if (!snapshot) {
    return true;
  }
  return !snapshotMatchesRequestedUrl(snapshot, requestedRoomId, requestedPlacement);
}
