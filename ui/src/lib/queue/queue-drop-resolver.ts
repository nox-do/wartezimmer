import type { QueueStatus } from './types';
import type { RoomTarget } from './room-target';

export type QueueDragZone = 'waiting' | 'active';

export type QueueDragSource = {
  ticketId: string;
  zone: QueueDragZone;
  status: QueueStatus;
  roomId: string | null;
};

export type QueueDropTarget =
  | { kind: 'room'; roomId: string; roomLabel: string }
  | { kind: 'waiting' };

export type QueueDropCommand =
  | { action: 'call'; ticketId: string; room: RoomTarget }
  | { action: 'reassign'; ticketId: string; room: RoomTarget }
  | { action: 'return-to-waiting'; ticketId: string };

function normalizeRoomId(roomId: string | null | undefined): string | null {
  const trimmed = roomId?.trim();
  return trimmed ? trimmed : null;
}

/** Maps a completed drag gesture to a queue API transition, or null when nothing should happen. */
export function resolveQueueDrop(
  source: QueueDragSource,
  target: QueueDropTarget | null,
): QueueDropCommand | null {
  if (!target) {
    return null;
  }

  if (target.kind === 'waiting') {
    if (source.zone !== 'active') {
      return null;
    }
    return { action: 'return-to-waiting', ticketId: source.ticketId };
  }

  const targetRoom: RoomTarget = {
    roomId: target.roomId,
    roomLabel: target.roomLabel,
  };

  if (source.zone === 'waiting') {
    return { action: 'call', ticketId: source.ticketId, room: targetRoom };
  }

  if (source.zone === 'active') {
    const sourceRoomId = normalizeRoomId(source.roomId);
    if (sourceRoomId === target.roomId) {
      return null;
    }
    return { action: 'reassign', ticketId: source.ticketId, room: targetRoom };
  }

  return null;
}

export function queueDragSourceFromItem(
  item: { ticketId: string; status: QueueStatus; roomId?: string | null },
  zone: QueueDragZone,
): QueueDragSource {
  return {
    ticketId: item.ticketId,
    zone,
    status: item.status,
    roomId: normalizeRoomId(item.roomId),
  };
}

export function readQueueDropTarget(data: unknown): QueueDropTarget | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const record = data as Record<string, unknown>;
  if (record.kind === 'waiting') {
    return { kind: 'waiting' };
  }

  if (
    record.kind === 'room' &&
    typeof record.roomId === 'string' &&
    typeof record.roomLabel === 'string'
  ) {
    return {
      kind: 'room',
      roomId: record.roomId,
      roomLabel: record.roomLabel,
    };
  }

  return null;
}
