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

export function roomPanelCanCheckIn(panel: Pick<RoomPanelPolicyInput, 'placement' | 'mode'>): boolean {
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

/** Patient call from the room tablet — inside only, explicitly enabled, never at the door. */
export function roomPanelCanCall(panel: RoomPanelPolicyInput): boolean {
  return (
    panel.placement === 'inside' &&
    panel.enabled === true &&
    panel.allowCalling === true
  );
}

export function resolveRoomPanelCapabilities(panel: RoomPanelPolicyInput): RoomPanelCapabilities {
  return {
    requiresPin: roomPanelRequiresPin(panel.placement),
    canCheckIn: roomPanelCanCheckIn(panel),
    canCheckOut: roomPanelCanCheckOut(panel),
    mayShowPatientNames: roomPanelMayShowPatientNames(panel),
    canCall: roomPanelCanCall(panel),
  };
}

export type RoomPanelCallVisitInput = {
  status: string;
  movementMode?: string | null;
  destinationRoomId?: string | null;
  targetLocationId?: string | null;
  roomId?: string | null;
};

/** Next or current target room for panel scope (waiting, called, directed, in_room). */
export function resolveVisitTargetRoomId(visit: RoomPanelCallVisitInput): string | null {
  const destination = visit.destinationRoomId?.trim() || visit.targetLocationId?.trim() || '';
  if (destination) {
    return destination;
  }
  const assigned = visit.roomId?.trim() || '';
  return assigned || null;
}

/** Generic room scope: visit belongs on this room's panel (list, snapshot, call candidates). */
export function roomPanelVisitTargetsRoom(
  visit: RoomPanelCallVisitInput,
  sessionRoomId: string,
): boolean {
  const roomId = sessionRoomId.trim();
  return roomId.length > 0 && resolveVisitTargetRoomId(visit) === roomId;
}

/** @deprecated Use roomPanelVisitTargetsRoom; call validity is enforced by flow-core on transition. */
export function roomPanelMayCallVisit(
  visit: RoomPanelCallVisitInput,
  sessionRoomId: string,
): boolean {
  return roomPanelVisitTargetsRoom(visit, sessionRoomId);
}
