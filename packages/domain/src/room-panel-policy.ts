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

export type RoomPanelCallVisitInput = {
  status: string;
  movementMode?: string | null;
  destinationRoomId?: string | null;
  targetLocationId?: string | null;
  roomId?: string | null;
};

/**
 * Status-aware target room for panel scope.
 * - waiting/directed: destinationRoomId || targetLocationId
 * - called/in_room: roomId preferred (current assignment)
 */
export function resolveVisitTargetRoomId(visit: RoomPanelCallVisitInput): string | null {
  const status = visit.status?.trim() || '';
  const destination = visit.destinationRoomId?.trim() || visit.targetLocationId?.trim() || '';
  const assigned = visit.roomId?.trim() || '';

  if (status === 'called' || status === 'in_room') {
    return assigned || destination || null;
  }

  return destination || null;
}

/** Generic room scope: visit belongs on this room's panel (list, snapshot, call candidates). */
export function visitTargetsRoom(visit: RoomPanelCallVisitInput, sessionRoomId: string): boolean {
  const roomId = sessionRoomId.trim();
  return roomId.length > 0 && resolveVisitTargetRoomId(visit) === roomId;
}

/** @deprecated Use visitTargetsRoom. */
export function roomPanelVisitTargetsRoom(
  visit: RoomPanelCallVisitInput,
  sessionRoomId: string,
): boolean {
  return visitTargetsRoom(visit, sessionRoomId);
}

/** @deprecated Use visitTargetsRoom; call validity is enforced by flow-core on transition. */
export function roomPanelMayCallVisit(
  visit: RoomPanelCallVisitInput,
  sessionRoomId: string,
): boolean {
  return visitTargetsRoom(visit, sessionRoomId);
}
