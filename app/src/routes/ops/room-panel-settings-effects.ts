import type { StaffSessionManager } from '../../auth/staff-session-auth.js';
import { ROOM_PANEL_PLACEMENTS, roomPanelsOrDefault } from '@praxis-flow/domain';
import type { OpsSettings } from '../../shared/db/db-types.js';

export function applyRoomPanelSettingsEffects(input: {
  previous: Pick<OpsSettings, 'rooms'>;
  updated: Pick<OpsSettings, 'rooms'>;
  sessions: Pick<
    StaffSessionManager,
    'revokeRoomPanelSessions' | 'revokeRoomPanelSessionPlacement'
  >;
  publishQueueUpdate: () => void;
}): void {
  const updatedById = new Map(input.updated.rooms.map((room) => [room.roomId, room]));
  for (const previousRoom of input.previous.rooms) {
    const nextRoom = updatedById.get(previousRoom.roomId);
    if (!nextRoom?.enabled) {
      input.sessions.revokeRoomPanelSessions(previousRoom.roomId);
      continue;
    }

    const previousPanels = roomPanelsOrDefault(previousRoom);
    const nextPanels = roomPanelsOrDefault(nextRoom);
    for (const placement of ROOM_PANEL_PLACEMENTS) {
      if (previousPanels[placement].enabled && !nextPanels[placement].enabled) {
        input.sessions.revokeRoomPanelSessionPlacement(previousRoom.roomId, placement);
      }
    }
  }
  input.publishQueueUpdate();
}
