import type { RoomPanelPlacement } from '@praxis-flow/domain';

export type RoomPanelRequestedSession = {
  roomId: string;
  panel: {
    placement: RoomPanelPlacement;
  };
};

export function readRequestedPlacementParam(placement: string): RoomPanelPlacement | '' {
  return placement === 'outside' || placement === 'inside' ? placement : '';
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
