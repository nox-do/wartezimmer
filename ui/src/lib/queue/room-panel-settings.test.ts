import { describe, expect, it } from 'vitest';
import { DEFAULT_ROOM_PANELS_SETTINGS } from '@praxis-flow/domain';
import { updateRoomPanelPlacementConfig } from './room-panel-settings';

describe('updateRoomPanelPlacementConfig', () => {
  it('updates only the targeted placement', () => {
    const result = updateRoomPanelPlacementConfig(DEFAULT_ROOM_PANELS_SETTINGS, 'inside', {
      enabled: true,
      mode: 'staff_full',
      showPatientNames: true,
    });

    expect(result.outside).toEqual(DEFAULT_ROOM_PANELS_SETTINGS.outside);
    expect(result.inside.enabled).toBe(true);
    expect(result.inside.mode).toBe('staff_full');
    expect(result.inside.showPatientNames).toBe(true);
  });

  it('coerces protected outside settings', () => {
    const result = updateRoomPanelPlacementConfig(DEFAULT_ROOM_PANELS_SETTINGS, 'outside', {
      enabled: true,
      mode: 'staff_full',
      showPatientNames: true,
      allowCalling: true,
    });

    expect(result.outside.mode).toBe('arrival');
    expect(result.outside.showPatientNames).toBe(false);
    expect(result.outside.allowCalling).toBe(false);
  });
});
