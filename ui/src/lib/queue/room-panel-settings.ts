import type { RoomPanelPlacement, RoomPanelSettings } from './ops-settings-api';

export function applyRoomPanelPlacement(
  settings: RoomPanelSettings,
  placement: RoomPanelPlacement,
): RoomPanelSettings {
  return {
    ...settings,
    placement,
    mode: placement === 'outside' && settings.mode === 'staff_full' ? 'arrival' : settings.mode,
    showPatientNames: placement === 'inside' ? settings.showPatientNames : false,
  };
}
