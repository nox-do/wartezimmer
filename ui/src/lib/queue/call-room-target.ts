import type { QueueItem } from './types';
import type { RoomTarget } from './room-target';
import { roomTargetFromTicketDestination } from './room-target';

export function resolveCallRoomTarget(
  item: QueueItem | undefined,
  sessionOverride?: RoomTarget | null,
): RoomTarget | undefined {
  if (sessionOverride) {
    return sessionOverride;
  }
  return roomTargetFromTicketDestination(item);
}
