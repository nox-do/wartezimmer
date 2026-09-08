import type { PracticeRoom } from './ops-settings-api';
import type { QueueItem } from './types';
import { countRoomOccupants, resolveRoomMaxOccupancy } from './room-capacity';

export type ActiveRoomGroup = {
  roomId: string;
  roomLabel: string;
  tickets: QueueItem[];
  occupantCount: number;
  maxOccupancy: number | null;
  isAtCapacity: boolean;
};

export type ActiveRoomBoard = {
  underway: QueueItem[];
  groups: ActiveRoomGroup[];
  unassigned: QueueItem[];
};

function ticketRoomId(item: QueueItem, includeDestination: boolean): string | null {
  const roomId = item.roomId?.trim() || (includeDestination ? item.destinationRoomId?.trim() : '');
  return roomId ? roomId : null;
}

/** Groups active queue tickets by configured practice rooms; unknown roomIds land in unassigned. */
export function buildActiveRoomBoard(
  active: QueueItem[],
  enabledRooms: PracticeRoom[],
  separateUnderway = true,
): ActiveRoomBoard {
  const roomIds = new Set(enabledRooms.map((room) => room.roomId));
  const ticketsByRoomId = new Map<string, QueueItem[]>();

  for (const room of enabledRooms) {
    ticketsByRoomId.set(room.roomId, []);
  }

  const unassigned: QueueItem[] = [];
  const underway: QueueItem[] = [];

  for (const item of active) {
    const isUnderway = item.status === 'called' || item.status === 'directed';
    const roomId = ticketRoomId(item, isUnderway);
    const hasConfiguredRoom = Boolean(roomId && roomIds.has(roomId));
    if (separateUnderway && isUnderway && hasConfiguredRoom) {
      underway.push(item);
      continue;
    }
    if (roomId && hasConfiguredRoom) {
      ticketsByRoomId.get(roomId)?.push(item);
      continue;
    }
    unassigned.push(item);
  }

  const groups = enabledRooms.map((room) => {
    const maxOccupancy = resolveRoomMaxOccupancy(enabledRooms, room.roomId);
    const occupantCount = countRoomOccupants(active, room.roomId);
    return {
      roomId: room.roomId,
      roomLabel: room.roomLabel,
      tickets: ticketsByRoomId.get(room.roomId) ?? [],
      occupantCount,
      maxOccupancy,
      isAtCapacity: maxOccupancy != null && occupantCount >= maxOccupancy,
    };
  });

  return { underway, groups, unassigned };
}
