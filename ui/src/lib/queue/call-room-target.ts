import type { QueueItem } from './types';
import type { RoomTarget } from './room-target';
import { roomTargetFromTicketDestination } from './room-target';

export function resolveCallRoomTarget(item: QueueItem | undefined): RoomTarget | undefined {
  return roomTargetFromTicketDestination(item);
}
