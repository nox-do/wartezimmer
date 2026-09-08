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
  _roomLabel?: string,
  ticketDestination?: VisitDestinationRoom | null,
): ResolvedCallRoom | null {
  const trimmedId = roomId?.trim();
  if (trimmedId) {
    const room = settings.rooms.find((entry) => entry.enabled && entry.roomId === trimmedId);
    return room ? { roomId: room.roomId, roomLabel: room.roomLabel } : null;
  }

  const snapshotId = ticketDestination?.roomId?.trim();
  if (snapshotId) {
    const room = settings.rooms.find((entry) => entry.enabled && entry.roomId === snapshotId);
    return room ? { roomId: room.roomId, roomLabel: room.roomLabel } : null;
  }

  return null;
}
