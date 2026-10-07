import { ROOM_PANEL_PLACEMENTS, roomPanelsOrDefault } from '@wartezimmer/domain';
import type { RoomPanelPlacement } from '../../shared/db/db-types.js';
import type { OpsSettings } from '../../shared/db/db-types.js';

export function applyRoomPanelSettingsEffects(input: {
  previous: Pick<OpsSettings, 'rooms'>;
  updated: Pick<OpsSettings, 'rooms'>;
  grants: {
    revokeRoomPanelAuthorizationsByRoom(roomId: string): number;
    revokeRoomPanelAuthorizationsByPlacement(roomId: string, placement: RoomPanelPlacement): number;
  };
  publishQueueUpdate: () => void;
}): void {
  const updatedById = new Map(input.updated.rooms.map((room) => [room.roomId, room]));
  for (const previousRoom of input.previous.rooms) {
    const nextRoom = updatedById.get(previousRoom.roomId);
    if (!nextRoom?.enabled) {
      input.grants.revokeRoomPanelAuthorizationsByRoom(previousRoom.roomId);
      continue;
    }

    const previousPanels = roomPanelsOrDefault(previousRoom);
    const nextPanels = roomPanelsOrDefault(nextRoom);
    for (const placement of ROOM_PANEL_PLACEMENTS) {
      if (previousPanels[placement].enabled && !nextPanels[placement].enabled) {
        input.grants.revokeRoomPanelAuthorizationsByPlacement(previousRoom.roomId, placement);
      }
    }
  }
  input.publishQueueUpdate();
}
