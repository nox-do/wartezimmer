import type { RoomPanelPlacement } from '$lib/queue/ops-settings-api';
import type { RoomPanelRoom } from './room-panel-api';

export function roomPanelLoginKey(room: Pick<RoomPanelRoom, 'roomId' | 'placement'>): string {
  return `${room.roomId}:${room.placement}`;
}

export function parseRoomPanelLoginKey(
  key: string,
): { roomId: string; placement: RoomPanelPlacement } | null {
  const separator = key.indexOf(':');
  if (separator <= 0) {
    return null;
  }
  const roomId = key.slice(0, separator).trim();
  const placement = key.slice(separator + 1).trim();
  if (!roomId || (placement !== 'outside' && placement !== 'inside')) {
    return null;
  }
  return { roomId, placement };
}

export function findRoomPanelLoginEntry(
  rooms: RoomPanelRoom[],
  key: string,
): RoomPanelRoom | null {
  const parsed = parseRoomPanelLoginKey(key);
  if (!parsed) {
    return null;
  }
  return (
    rooms.find(
      (room) => room.roomId === parsed.roomId && room.placement === parsed.placement,
    ) ?? null
  );
}
