import type { StaffSessionManager } from '../../auth/staff-session-auth.js';
import type { OpsSettings } from '../../shared/db/db-types.js';

export function applyRoomPanelSettingsEffects(input: {
  previous: Pick<OpsSettings, 'rooms'>;
  updated: Pick<OpsSettings, 'rooms'>;
  sessions: Pick<StaffSessionManager, 'revokeRoomPanelSessions'>;
  publishQueueUpdate: () => void;
}): void {
  const updatedById = new Map(input.updated.rooms.map((room) => [room.roomId, room]));
  for (const previousRoom of input.previous.rooms) {
    const nextRoom = updatedById.get(previousRoom.roomId);
    if (
      !nextRoom?.enabled ||
      !nextRoom.panel?.enabled ||
      previousRoom.panel?.placement !== nextRoom.panel.placement
    ) {
      input.sessions.revokeRoomPanelSessions(previousRoom.roomId);
    }
  }
  input.publishQueueUpdate();
}
