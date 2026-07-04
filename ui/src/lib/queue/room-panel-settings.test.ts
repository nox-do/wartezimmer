import { describe, expect, it } from 'vitest';
import type { RoomPanelSettings } from './ops-settings-api';
import { applyRoomPanelPlacement } from './room-panel-settings';

const defaultSettings: RoomPanelSettings = {
  enabled: true,
  placement: 'outside',
  mode: 'display_only',
  showPatientNames: false,
  calledTextPreset: 'please_enter',
  calledTextCustom: null,
  arrivedTextPreset: 'please_wait_here',
  arrivedTextCustom: null,
};

describe('applyRoomPanelPlacement', () => {
  it('removes protected data and checkout actions outside', () => {
    const result = applyRoomPanelPlacement(
      {
        ...defaultSettings,
        placement: 'inside',
        mode: 'staff_full',
        showPatientNames: true,
      },
      'outside',
    );

    expect(result.placement).toBe('outside');
    expect(result.mode).toBe('arrival');
    expect(result.showPatientNames).toBe(false);
  });

  it('keeps an explicit inside configuration unchanged', () => {
    const result = applyRoomPanelPlacement({ ...defaultSettings, mode: 'arrival' }, 'inside');

    expect(result.placement).toBe('inside');
    expect(result.mode).toBe('arrival');
  });
});
