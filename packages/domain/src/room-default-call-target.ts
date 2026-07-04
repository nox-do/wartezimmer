export type RoomDefaultTargetSetting = {
  roomId: string;
  enabled: boolean;
  defaultCallTarget?: boolean;
};

export type RoomListing = RoomDefaultTargetSetting & {
  roomLabel: string;
};

export function listEnabledRooms<T extends RoomListing>(rooms: readonly T[]): T[] {
  return rooms.filter(
    (room) => room.enabled && room.roomId.trim().length > 0 && room.roomLabel.trim().length > 0,
  );
}

/** Exactly one enabled room is the default call target; others are cleared. */
export function ensureSingleDefaultCallTarget<T extends RoomDefaultTargetSetting>(
  rooms: readonly T[],
  preferredRoomId?: string | null,
): T[] {
  const enabled = rooms.filter((room) => room.enabled);
  if (enabled.length === 0) {
    return rooms.map((room) => ({ ...room, defaultCallTarget: false }));
  }

  const preferred =
    preferredRoomId && enabled.some((room) => room.roomId === preferredRoomId)
      ? preferredRoomId
      : null;
  const existingDefault = rooms.find((room) => room.enabled && room.defaultCallTarget)?.roomId;
  const targetId = preferred ?? existingDefault ?? enabled[0].roomId;

  return rooms.map((room) => ({
    ...room,
    defaultCallTarget: room.enabled && room.roomId === targetId,
  }));
}

export function resolveDefaultCallRoomId<T extends RoomListing>(
  rooms: readonly T[],
): string | null {
  const enabled = listEnabledRooms(rooms);
  if (enabled.length === 0) {
    return null;
  }
  return enabled.find((room) => room.defaultCallTarget)?.roomId ?? enabled[0].roomId;
}
