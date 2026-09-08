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
  // During an escorted room-to-room transfer, roomId is deliberately the last
  // known (origin) room while destinationRoomId is the pending Journey target.
  // "Abgeholt" completes that accompanied transfer at its destination.
  if (item?.escortTransferPending) {
    return roomTargetFromTicketDestination(item) ?? roomTargetFromQueueItem(item);
  }
  return roomTargetFromQueueItem(item) ?? roomTargetFromTicketDestination(item);
}
