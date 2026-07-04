import type { CoreDatabase } from '../db/database.js';
import type { OpsSettings, RoomPanelPlacement, RoomPanelSettings } from '../db/db-types.js';

export type ActiveRoomPanel = {
  room: OpsSettings['rooms'][number];
  panel: RoomPanelSettings;
};

export function roomPanelRequiresPin(placement: RoomPanelPlacement): boolean {
  return placement === 'inside';
}

export function roomPanelCanCheckIn(panel: Pick<RoomPanelSettings, 'placement' | 'mode'>): boolean {
  return panel.mode === 'arrival' || (panel.placement === 'inside' && panel.mode === 'staff_full');
}

export function roomPanelCanCheckOut(
  panel: Pick<RoomPanelSettings, 'placement' | 'mode'>,
): boolean {
  return panel.placement === 'inside' && panel.mode === 'staff_full';
}

export function roomPanelMayShowPatientNames(panel: RoomPanelSettings): boolean {
  return panel.placement === 'inside' && panel.showPatientNames === true;
}

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
