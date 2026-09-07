export type RoomDefaultTargetSetting = {
  roomId: string;
  enabled: boolean;
  defaultCallTarget?: boolean;
};

export type RoomListing = RoomDefaultTargetSetting & {
  roomLabel: string;
};

export const WAITING_ROOM_LOCATION_ID = 'pf_waiting';
export const WAITING_ROOM_LABEL = 'Wartezimmer';
export const RESERVED_ROOM_IDS = [WAITING_ROOM_LOCATION_ID, 'waiting-room'] as const;

function normalizedRoomToken(value: string): string {
  return value.trim().toLocaleLowerCase('de-DE');
}

export function isWaitingRoomLocationId(roomId: string | null | undefined): boolean {
  return normalizedRoomToken(roomId ?? '') === WAITING_ROOM_LOCATION_ID;
}

export function isReservedRoomId(roomId: string): boolean {
  const normalized = normalizedRoomToken(roomId);
  return (RESERVED_ROOM_IDS as readonly string[]).includes(normalized);
}

export function isReservedRoomLabel(roomLabel: string): boolean {
  return normalizedRoomToken(roomLabel) === normalizedRoomToken(WAITING_ROOM_LABEL);
}

export function listEnabledRooms<T extends RoomListing>(rooms: readonly T[]): T[] {
  return rooms.filter(
    (room) =>
      room.enabled &&
      !isWaitingRoomLocationId(room.roomId) &&
      room.roomId.trim().length > 0 &&
      room.roomLabel.trim().length > 0,
  );
}

/** Zero marked rooms means the waiting room; otherwise exactly one enabled room is marked. */
export function ensureSingleDefaultCallTarget<T extends RoomDefaultTargetSetting>(
  rooms: readonly T[],
  preferredRoomId?: string | null,
): T[] {
  const enabled = rooms.filter((room) => room.enabled && !isWaitingRoomLocationId(room.roomId));
  if (preferredRoomId && isWaitingRoomLocationId(preferredRoomId)) {
    return rooms.map((room) => ({ ...room, defaultCallTarget: false }));
  }

  const preferred =
    preferredRoomId && enabled.some((room) => room.roomId === preferredRoomId)
      ? preferredRoomId
      : null;
  const existingDefault = enabled.find((room) => room.defaultCallTarget)?.roomId ?? null;
  const targetId = preferred ?? existingDefault;

  return rooms.map((room) => ({
    ...room,
    defaultCallTarget: targetId != null && room.enabled && room.roomId === targetId,
  }));
}

export function resolveDefaultCallRoomId<T extends RoomListing>(
  rooms: readonly T[],
): string | null {
  return (
    listEnabledRooms(rooms).find((room) => room.defaultCallTarget)?.roomId ??
    WAITING_ROOM_LOCATION_ID
  );
}
