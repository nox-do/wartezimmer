import type { OpsSettings } from '../db/db-types.js';

export type ResolvedCallRoom = {
  roomId: string;
  roomLabel: string;
};

export type VisitDestinationRoom = {
  roomId: string;
  roomLabel: string;
};

export function resolveCallRoomForVisit(
  settings: Pick<OpsSettings, 'rooms'>,
  roomId?: string,
  roomLabel?: string,
  ticketDestination?: VisitDestinationRoom | null,
): ResolvedCallRoom | null {
  const trimmedId = roomId?.trim();
  const trimmedLabel = roomLabel?.trim();

  if (trimmedId && trimmedLabel) {
    return { roomId: trimmedId, roomLabel: trimmedLabel };
  }

  if (trimmedId) {
    const room = settings.rooms.find((entry) => entry.enabled && entry.roomId === trimmedId);
    if (room) {
      return { roomId: room.roomId, roomLabel: room.roomLabel };
    }
    if (trimmedLabel) {
      return { roomId: trimmedId, roomLabel: trimmedLabel };
    }
    return { roomId: trimmedId, roomLabel: trimmedId };
  }

  const snapshotId = ticketDestination?.roomId?.trim();
  const snapshotLabel = ticketDestination?.roomLabel?.trim();
  if (snapshotId && snapshotLabel) {
    return { roomId: snapshotId, roomLabel: snapshotLabel };
  }

  return null;
}
