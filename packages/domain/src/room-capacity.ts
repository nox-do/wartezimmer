export const ROOM_OCCUPYING_STATUSES = ['called', 'in_room'] as const;
export const ROOM_AT_CAPACITY = 'ROOM_AT_CAPACITY';
export const ROOM_BLOCKED_CAPACITY = 'ROOM_BLOCKED_CAPACITY';

export type RoomOccupyingStatus = (typeof ROOM_OCCUPYING_STATUSES)[number];

export type RoomWithCapacity = {
  roomId: string;
  maxOccupancy?: number | null;
};

export type RoomOccupant = {
  roomId: string | null | undefined;
  status: string;
};

export type RoomOccupantWithId = RoomOccupant & {
  occupantId: string;
};

export function isRoomOccupyingStatus(status: string): status is RoomOccupyingStatus {
  return (ROOM_OCCUPYING_STATUSES as readonly string[]).includes(status);
}

export function normalizeMaxOccupancy(value: number | null | undefined): number | null {
  if (value == null) {
    return null;
  }
  if (!Number.isInteger(value) || value < 1) {
    return null;
  }
  return value;
}

export function parseMaxOccupancy(value: unknown): number | null {
  return normalizeMaxOccupancy(typeof value === 'number' ? value : null);
}

export function resolveRoomMaxOccupancy(
  rooms: readonly RoomWithCapacity[],
  roomId: string,
): number | null {
  const room = rooms.find((entry) => entry.roomId === roomId);
  if (!room) {
    return null;
  }
  return normalizeMaxOccupancy(room.maxOccupancy ?? null);
}

export function countRoomOccupants(occupants: readonly RoomOccupant[], roomId: string): number {
  let count = 0;
  for (const occupant of occupants) {
    if (occupant.roomId !== roomId || !isRoomOccupyingStatus(occupant.status)) {
      continue;
    }
    count += 1;
  }
  return count;
}

export function countRoomOccupantsExcluding(
  occupants: readonly RoomOccupantWithId[],
  roomId: string,
  excludeOccupantId: string,
): number {
  const trimmedExcludeId = excludeOccupantId.trim();
  let count = 0;
  for (const occupant of occupants) {
    if (occupant.occupantId === trimmedExcludeId) {
      continue;
    }
    if (occupant.roomId !== roomId || !isRoomOccupyingStatus(occupant.status)) {
      continue;
    }
    count += 1;
  }
  return count;
}

export function roomHasCapacity(
  rooms: readonly RoomWithCapacity[],
  occupants: readonly RoomOccupantWithId[],
  roomId: string,
  excludeOccupantId?: string,
): boolean {
  const maxOccupancy = resolveRoomMaxOccupancy(rooms, roomId);
  if (maxOccupancy == null) {
    return true;
  }
  const count =
    excludeOccupantId != null
      ? countRoomOccupantsExcluding(occupants, roomId, excludeOccupantId)
      : countRoomOccupants(occupants, roomId);
  return count < maxOccupancy;
}
