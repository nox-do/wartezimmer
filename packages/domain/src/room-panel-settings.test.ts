import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyRoomPanelPlacement,
  DEFAULT_ROOM_PANEL_PLACEMENT_CONFIG,
  DEFAULT_ROOM_PANEL_SETTINGS,
  DEFAULT_ROOM_PANELS_SETTINGS,
  listEnabledRoomPanelPlacements,
  normalizeRoomPanelCustomText,
  normalizeRoomPanelPlacementConfig,
  normalizeRoomPanelSettings,
  normalizeRoomPanelsSettings,
  resolveRoomPanelDisplayTextConfig,
  updateRoomPanelPlacementConfig,
  roomHasAnyEnabledPanel,
  roomPanelConfigForPlacement,
  ROOM_PANEL_CUSTOM_TEXT_MAX_LENGTH,
} from './room-panel-settings.js';

test('normalizeRoomPanelPlacementConfig applies defaults and outside constraints', () => {
  assert.deepEqual(
    normalizeRoomPanelPlacementConfig('outside', null),
    DEFAULT_ROOM_PANEL_PLACEMENT_CONFIG,
  );
  assert.deepEqual(
    normalizeRoomPanelPlacementConfig('outside', {
      enabled: true,
      mode: 'staff_full',
      showPatientNames: true,
      allowCalling: true,
      calledTextPreset: 'please_enter',
      calledTextCustom: '  hi  ',
      arrivedTextPreset: 'please_wait_here',
      arrivedTextCustom: null,
    }),
    {
      enabled: true,
      mode: 'arrival',
      showPatientNames: false,
      allowCalling: false,
      calledTextPreset: 'please_enter',
      calledTextCustom: 'hi',
      arrivedTextPreset: 'please_wait_here',
      arrivedTextCustom: null,
    },
  );
  assert.deepEqual(
    normalizeRoomPanelPlacementConfig('inside', {
      enabled: true,
      mode: 'staff_full',
      showPatientNames: true,
      allowCalling: true,
    }),
    {
      enabled: true,
      mode: 'staff_full',
      showPatientNames: true,
      allowCalling: true,
      calledTextPreset: 'please_enter',
      calledTextCustom: null,
      arrivedTextPreset: 'please_wait_here',
      arrivedTextCustom: null,
    },
  );
  assert.equal(
    normalizeRoomPanelPlacementConfig('inside', {
      enabled: true,
      mode: 'arrival',
      allowCalling: true,
    }).allowCalling,
    false,
  );
});

test('normalizeRoomPanelsSettings normalizes both placements independently', () => {
  assert.deepEqual(normalizeRoomPanelsSettings(null), DEFAULT_ROOM_PANELS_SETTINGS);
  assert.deepEqual(
    normalizeRoomPanelsSettings({
      outside: { enabled: true, mode: 'arrival' },
      inside: { enabled: true, mode: 'staff_full', showPatientNames: true, allowCalling: true },
    }),
    {
      outside: {
        enabled: true,
        mode: 'arrival',
        showPatientNames: false,
        allowCalling: false,
        calledTextPreset: 'please_enter',
        calledTextCustom: null,
        arrivedTextPreset: 'please_wait_here',
        arrivedTextCustom: null,
      },
      inside: {
        enabled: true,
        mode: 'staff_full',
        showPatientNames: true,
        allowCalling: true,
        calledTextPreset: 'please_enter',
        calledTextCustom: null,
        arrivedTextPreset: 'please_wait_here',
        arrivedTextCustom: null,
      },
    },
  );
});

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
      allowCalling: false,
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

test('normalizeRoomPanelSettings forces allowCalling off outside', () => {
  assert.deepEqual(
    normalizeRoomPanelSettings({
      enabled: true,
      placement: 'outside',
      mode: 'arrival',
      allowCalling: true,
    }).allowCalling,
    false,
  );
  assert.equal(
    normalizeRoomPanelSettings({
      enabled: true,
      placement: 'inside',
      mode: 'staff_full',
      allowCalling: true,
    }).allowCalling,
    true,
  );
});

test('roomPanelsOrDefault and listEnabledRoomPanelPlacements', () => {
  const room = {
    panels: normalizeRoomPanelsSettings({
      outside: { enabled: true, mode: 'arrival' },
      inside: { enabled: true, mode: 'staff_full', allowCalling: true },
    }),
  };
  assert.deepEqual(listEnabledRoomPanelPlacements(room), ['outside', 'inside']);
  assert.equal(roomHasAnyEnabledPanel(room), true);
  assert.equal(roomPanelConfigForPlacement(room, 'inside').allowCalling, true);
});

test('updateRoomPanelPlacementConfig patches one placement', () => {
  const result = updateRoomPanelPlacementConfig(DEFAULT_ROOM_PANELS_SETTINGS, 'inside', {
    enabled: true,
    mode: 'staff_full',
    allowCalling: true,
  });
  assert.equal(result.inside.enabled, true);
  assert.equal(result.inside.allowCalling, true);
  assert.equal(result.outside.allowCalling, false);
});

test('resolveRoomPanelDisplayTextConfig uses custom or falls back', () => {
  assert.deepEqual(
    resolveRoomPanelDisplayTextConfig('custom', '  Hallo  ', 'please_enter'),
    { preset: 'custom', custom: 'Hallo' },
  );
  assert.deepEqual(
    resolveRoomPanelDisplayTextConfig('custom', '   ', 'please_wait_here'),
    { preset: 'please_wait_here', custom: null },
  );
  assert.deepEqual(
    resolveRoomPanelDisplayTextConfig('please_enter', null, 'please_wait_here'),
    { preset: 'please_enter', custom: null },
  );
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
  assert.equal(outside.allowCalling, false);
});
