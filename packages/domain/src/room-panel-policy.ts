import type { RoomPanelMode, RoomPanelPlacement } from './room-panel-settings.js';

export type RoomPanelPolicyInput = {
  placement: RoomPanelPlacement;
  mode: RoomPanelMode;
  enabled?: boolean;
  showPatientNames?: boolean;
  allowCalling?: boolean;
};

export type RoomPanelCapabilities = {
  requiresPin: boolean;
  canCheckIn: boolean;
  canCheckOut: boolean;
  mayShowPatientNames: boolean;
  canCall: boolean;
};

/** Inside panels require the shared room-panel PIN; outside panels do not. */
export function roomPanelRequiresPin(placement: RoomPanelPlacement): boolean {
  return placement === 'inside';
}

export function roomPanelCanCheckIn(
  panel: Pick<RoomPanelPolicyInput, 'placement' | 'mode'>,
): boolean {
  return panel.mode === 'arrival' || (panel.placement === 'inside' && panel.mode === 'staff_full');
}

export function roomPanelCanCheckOut(
  panel: Pick<RoomPanelPolicyInput, 'placement' | 'mode'>,
): boolean {
  return panel.placement === 'inside' && panel.mode === 'staff_full';
}

export function roomPanelMayShowPatientNames(
  panel: Pick<RoomPanelPolicyInput, 'placement' | 'showPatientNames'>,
): boolean {
  return panel.placement === 'inside' && panel.showPatientNames === true;
}

/** Patient call from the room tablet — inside staff_full only, explicitly enabled, never at the door. */
export function roomPanelCanCall(panel: RoomPanelPolicyInput): boolean {
  return (
    panel.placement === 'inside' &&
    panel.enabled === true &&
    panel.mode === 'staff_full' &&
    panel.allowCalling === true
  );
}

export function resolveRoomPanelCapabilities(panel: RoomPanelPolicyInput): RoomPanelCapabilities {
  const requiresPin = roomPanelRequiresPin(panel.placement);
  if (panel.enabled !== true) {
    return {
      requiresPin,
      canCheckIn: false,
      canCheckOut: false,
      mayShowPatientNames: false,
      canCall: false,
    };
  }

  return {
    requiresPin,
    canCheckIn: roomPanelCanCheckIn(panel),
    canCheckOut: roomPanelCanCheckOut(panel),
    mayShowPatientNames: roomPanelMayShowPatientNames(panel),
    canCall: roomPanelCanCall(panel),
  };
}

/** Flow-Core canonical room scope for room-panel snapshots and transition guards. */
export type RoomTargetInput = {
  targetLocationId?: string | null;
};

/** Visit belongs on this room's panel when its Flow-Core target location matches the session room. */
export function visitTargetsRoom(visit: RoomTargetInput, sessionRoomId: string): boolean {
  const targetLocationId = visit.targetLocationId?.trim();
  const roomId = sessionRoomId.trim();
  return roomId.length > 0 && targetLocationId === roomId;
}
