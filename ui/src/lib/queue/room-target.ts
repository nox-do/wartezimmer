import type { PracticeRoom } from './ops-settings-api';
import type { QueueItem } from './types';

export type RoomTarget = {
  roomId: string;
  roomLabel: string;
};

export function toRoomTarget(room: PracticeRoom | null | undefined): RoomTarget | undefined {
  if (!room?.roomId || !room.roomLabel) {
    return undefined;
  }
  return {
    roomId: room.roomId,
    roomLabel: room.roomLabel,
  };
}

export function roomTargetFromQueueItem(item: QueueItem | undefined): RoomTarget | undefined {
  if (!item?.roomId || !item.roomLabel) {
    return undefined;
  }
  return {
    roomId: item.roomId,
    roomLabel: item.roomLabel,
  };
}

export function roomTargetFromTicketDestination(
  item: QueueItem | undefined,
): RoomTarget | undefined {
  const roomId = item?.destinationRoomId?.trim();
  const roomLabel = item?.destinationRoomLabel?.trim();
  if (!roomId || !roomLabel) {
    return undefined;
  }
  return { roomId, roomLabel };
}

export function resolveRoomTargetForCheckIn(item: QueueItem | undefined): RoomTarget | undefined {
  return roomTargetFromQueueItem(item) ?? roomTargetFromTicketDestination(item);
}
