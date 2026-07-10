import {
  applyRoomPanelPlacement as applyRoomPanelPlacementDomain,
  type RoomPanelPlacement,
  type RoomPanelSettings,
} from '@praxis-flow/domain';

export function applyRoomPanelPlacement(
  settings: RoomPanelSettings,
  placement: RoomPanelPlacement,
): RoomPanelSettings {
  return applyRoomPanelPlacementDomain(settings, placement);
}
