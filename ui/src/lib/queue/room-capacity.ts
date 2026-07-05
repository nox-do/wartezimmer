import type { PracticeRoom } from '$lib/queue/ops-settings-api';
import type { QueueItem } from '$lib/queue/types';
import {
  ROOM_AT_CAPACITY,
  ROOM_BLOCKED_CAPACITY,
  ROOM_OCCUPYING_STATUSES,
  countRoomOccupants as domainCountRoomOccupants,
  countRoomOccupantsExcluding as domainCountRoomOccupantsExcluding,
  isRoomOccupyingStatus,
  normalizeMaxOccupancy,
  resolveRoomMaxOccupancy,
  roomHasCapacity as domainRoomHasCapacity,
  type RoomOccupantWithId,
} from '@praxis-flow/domain';

export {
  ROOM_AT_CAPACITY,
  ROOM_BLOCKED_CAPACITY,
  ROOM_OCCUPYING_STATUSES,
  isRoomOccupyingStatus,
  normalizeMaxOccupancy,
  resolveRoomMaxOccupancy,
};

export type RoomOccupantItem = Pick<QueueItem, 'roomId' | 'status'>;
export type RoomOccupantItemWithId = RoomOccupantItem & Pick<QueueItem, 'visitId'>;

function toDomainOccupants(items: readonly RoomOccupantItemWithId[]): RoomOccupantWithId[] {
  return items.map((item) => ({
    roomId: item.roomId ?? null,
    status: item.status,
    occupantId: item.visitId,
  }));
}

export function countRoomOccupants(items: readonly RoomOccupantItem[], roomId: string): number {
  return domainCountRoomOccupants(
    items.map((item) => ({ roomId: item.roomId ?? null, status: item.status })),
    roomId,
  );
}

export function countRoomOccupantsExcluding(
  items: readonly RoomOccupantItemWithId[],
  roomId: string,
  excludeVisitId: string,
): number {
  return domainCountRoomOccupantsExcluding(toDomainOccupants(items), roomId, excludeVisitId);
}

export function roomHasCapacity(
  rooms: PracticeRoom[],
  items: readonly RoomOccupantItemWithId[],
  roomId: string,
  excludeVisitId?: string,
): boolean {
  return domainRoomHasCapacity(rooms, toDomainOccupants(items), roomId, excludeVisitId);
}

export function isRoomAtCapacity(
  rooms: PracticeRoom[],
  items: readonly RoomOccupantItemWithId[],
  roomId: string,
): boolean {
  return !roomHasCapacity(rooms, items, roomId);
}

export function roomOccupancyLabel(count: number, maxOccupancy: number | null): string | null {
  if (maxOccupancy == null) {
    return null;
  }
  return `${count}/${maxOccupancy}`;
}
