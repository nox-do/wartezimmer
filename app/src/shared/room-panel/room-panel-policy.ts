import type { CoreDatabase } from '../db/database.js';
import type { OpsSettings, RoomPanelPlacement, RoomPanelPlacementConfig } from '../db/db-types.js';

export {
  resolveRoomPanelCapabilities,
  roomPanelCanCall,
  roomPanelCanCheckIn,
  roomPanelCanCheckOut,
  roomPanelMayShowPatientNames,
  roomPanelRequiresPin,
  visitTargetsRoom,
  type RoomTargetInput,
  type RoomPanelCapabilities,
  type RoomPanelPolicyInput,
} from '@praxis-flow/domain';

import { roomPanelConfigForPlacement } from '@praxis-flow/domain';

export type ActiveRoomPanel = {
  room: OpsSettings['rooms'][number];
  placement: RoomPanelPlacement;
  panel: RoomPanelPlacementConfig;
};

export function findActiveRoomPanel(
  db: Pick<CoreDatabase, 'getOpsSettings'>,
  roomId: string,
  placement: RoomPanelPlacement,
): ActiveRoomPanel | null {
  const room = db.getOpsSettings().rooms.find((entry) => entry.roomId === roomId && entry.enabled);
  if (!room) {
    return null;
  }
  const panel = roomPanelConfigForPlacement(room, placement);
  if (!panel.enabled) {
    return null;
  }
  return { room, placement, panel };
}

export function resolveRoomPanelForSession(
  db: Pick<CoreDatabase, 'getOpsSettings'>,
  session: { roomId: string; placement: RoomPanelPlacement },
): ActiveRoomPanel | null {
  return findActiveRoomPanel(db, session.roomId, session.placement);
}
