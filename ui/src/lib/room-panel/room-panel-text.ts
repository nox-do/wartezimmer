import {
  resolveRoomPanelDisplayTextConfig,
  type RoomPanelTextPreset,
} from '@praxis-flow/domain';

const PRESET_I18N_KEY: Record<Exclude<RoomPanelTextPreset, 'custom'>, string> = {
  you_are_right: 'roomPanel.text_you_are_right',
  please_wait_here: 'roomPanel.text_please_wait_here',
  please_enter: 'roomPanel.text_please_enter',
  go_to_reception: 'roomPanel.text_go_to_reception',
};

export function roomPanelPresetI18nKey(preset: Exclude<RoomPanelTextPreset, 'custom'>): string {
  return PRESET_I18N_KEY[preset];
}

/** Live panel text or settings dropdown label for a preset (custom uses settings label). */
export function formatRoomPanelDisplayText(
  preset: RoomPanelTextPreset,
  custom: string | null,
  fallbackPreset: Exclude<RoomPanelTextPreset, 'custom'>,
  translate: (key: string) => string,
): string {
  const resolved = resolveRoomPanelDisplayTextConfig(preset, custom, fallbackPreset);
  if (resolved.preset === 'custom' && resolved.custom) {
    return resolved.custom;
  }
  const displayPreset: Exclude<RoomPanelTextPreset, 'custom'> =
    resolved.preset === 'custom' ? fallbackPreset : resolved.preset;
  return translate(PRESET_I18N_KEY[displayPreset]);
}

/** Dropdown option label — custom shows the settings meta-label, not user text. */
export function roomPanelPresetOptionLabel(
  preset: RoomPanelTextPreset,
  translate: (key: string) => string,
): string {
  if (preset === 'custom') {
    return translate('mfa.settings.roomPanelPreset_custom');
  }
  return translate(PRESET_I18N_KEY[preset]);
}
