import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyRoomPanelPlacement,
  DEFAULT_ROOM_PANEL_SETTINGS,
  normalizeRoomPanelCustomText,
  normalizeRoomPanelSettings,
  ROOM_PANEL_CUSTOM_TEXT_MAX_LENGTH,
} from './room-panel-settings.js';

test('normalizeRoomPanelSettings applies defaults and outside constraints', () => {
  assert.deepEqual(normalizeRoomPanelSettings(null), DEFAULT_ROOM_PANEL_SETTINGS);
  assert.deepEqual(
    normalizeRoomPanelSettings({
      enabled: true,
      placement: 'outside',
      mode: 'staff_full',
      showPatientNames: true,
      calledTextPreset: 'please_enter',
      calledTextCustom: '  hi  ',
      arrivedTextPreset: 'please_wait_here',
      arrivedTextCustom: null,
    }),
    {
      enabled: true,
      placement: 'outside',
      mode: 'arrival',
      showPatientNames: false,
      calledTextPreset: 'please_enter',
      calledTextCustom: 'hi',
      arrivedTextPreset: 'please_wait_here',
      arrivedTextCustom: null,
    },
  );
});

test('normalizeRoomPanelCustomText truncates to max length', () => {
  const long = 'a'.repeat(ROOM_PANEL_CUSTOM_TEXT_MAX_LENGTH + 10);
  assert.equal(
    normalizeRoomPanelCustomText(long)?.length,
    ROOM_PANEL_CUSTOM_TEXT_MAX_LENGTH,
  );
  assert.equal(normalizeRoomPanelCustomText('   '), null);
});

test('applyRoomPanelPlacement coerces outside staff_full to arrival', () => {
  const inside = normalizeRoomPanelSettings({
    ...DEFAULT_ROOM_PANEL_SETTINGS,
    placement: 'inside',
    mode: 'staff_full',
    showPatientNames: true,
  });
  const outside = applyRoomPanelPlacement(inside, 'outside');
  assert.equal(outside.placement, 'outside');
  assert.equal(outside.mode, 'arrival');
  assert.equal(outside.showPatientNames, false);
});
