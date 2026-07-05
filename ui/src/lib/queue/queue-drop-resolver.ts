import type { QueueStatus } from './types';
import type { RoomTarget } from './room-target';

export type QueueDragZone = 'waiting' | 'active';

export type QueueDragSource = {
  visitId: string;
  zone: QueueDragZone;
  status: QueueStatus;
  roomId: string | null;
};

export type QueueDropTarget =
  | { kind: 'room'; roomId: string; roomLabel: string }
  | { kind: 'waiting' };

export type QueueDropCommand =
  | { action: 'call'; visitId: string; room: RoomTarget }
  | { action: 'reassign'; visitId: string; room: RoomTarget }
  | { action: 'return-to-waiting'; visitId: string };

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
    return { action: 'return-to-waiting', visitId: source.visitId };
  }

  const targetRoom: RoomTarget = {
    roomId: target.roomId,
    roomLabel: target.roomLabel,
  };

  if (source.zone === 'waiting') {
    return { action: 'call', visitId: source.visitId, room: targetRoom };
  }

  if (source.zone === 'active') {
    const sourceRoomId = normalizeRoomId(source.roomId);
    if (sourceRoomId === target.roomId) {
      return null;
    }
    return { action: 'reassign', visitId: source.visitId, room: targetRoom };
  }

  return null;
}

export function queueDragSourceFromItem(
  item: { visitId: string; status: QueueStatus; roomId?: string | null },
  zone: QueueDragZone,
): QueueDragSource {
  return {
    visitId: item.visitId,
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
