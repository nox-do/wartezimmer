import type { CoreDatabase } from '../db/database.js';
import type { OpsSettings, RoomPanelPlacement, RoomPanelSettings } from '../db/db-types.js';

export {
  resolveRoomPanelCapabilities,
  roomPanelCanCall,
  roomPanelCanCheckIn,
  roomPanelCanCheckOut,
  roomPanelMayCallVisit,
  roomPanelMayShowPatientNames,
  roomPanelRequiresPin,
  roomPanelVisitTargetsRoom,
  resolveVisitTargetRoomId,
  type RoomPanelCallVisitInput,
  type RoomPanelCapabilities,
  type RoomPanelPolicyInput,
} from '@praxis-flow/domain';

export type ActiveRoomPanel = {
  room: OpsSettings['rooms'][number];
  panel: RoomPanelSettings;
};

export function findActiveRoomPanel(
  db: Pick<CoreDatabase, 'getOpsSettings'>,
  roomId: string,
): ActiveRoomPanel | null {
  const room = db
    .getOpsSettings()
    .rooms.find(
      (entry) => entry.roomId === roomId && entry.enabled && entry.panel?.enabled === true,
    );
  if (!room?.panel) {
    return null;
  }
  return { room, panel: room.panel };
}

export function resolveRoomPanelForSession(
  db: Pick<CoreDatabase, 'getOpsSettings'>,
  session: { roomId: string; placement: RoomPanelPlacement },
): ActiveRoomPanel | null {
  const active = findActiveRoomPanel(db, session.roomId);
  if (!active || active.panel.placement !== session.placement) {
    return null;
  }
  return active;
}
