import {
  normalizeRoomPanelPlacementConfig,
  type RoomPanelPlacement,
  type RoomPanelPlacementConfig,
  type RoomPanelsSettings,
} from '@praxis-flow/domain';

export function updateRoomPanelPlacementConfig(
  panels: RoomPanelsSettings,
  placement: RoomPanelPlacement,
  patch: Partial<RoomPanelPlacementConfig>,
): RoomPanelsSettings {
  return {
    ...panels,
    [placement]: normalizeRoomPanelPlacementConfig(placement, {
      ...panels[placement],
      ...patch,
    }),
  };
}
