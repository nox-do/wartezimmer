export const ROOM_PANEL_PLACEMENTS = ['outside', 'inside'] as const;
export const ROOM_PANEL_MODES = ['display_only', 'arrival', 'staff_full'] as const;
export const ROOM_PANEL_TEXT_PRESETS = [
  'you_are_right',
  'please_wait_here',
  'please_enter',
  'go_to_reception',
  'custom',
] as const;

export const ROOM_PANEL_CUSTOM_TEXT_MAX_LENGTH = 80;

export type RoomPanelPlacement = (typeof ROOM_PANEL_PLACEMENTS)[number];
export type RoomPanelMode = (typeof ROOM_PANEL_MODES)[number];
export type RoomPanelTextPreset = (typeof ROOM_PANEL_TEXT_PRESETS)[number];

export type RoomPanelSettings = {
  enabled: boolean;
  placement: RoomPanelPlacement;
  mode: RoomPanelMode;
  showPatientNames: boolean;
  calledTextPreset: RoomPanelTextPreset;
  calledTextCustom: string | null;
  arrivedTextPreset: RoomPanelTextPreset;
  arrivedTextCustom: string | null;
};

export const DEFAULT_ROOM_PANEL_SETTINGS: RoomPanelSettings = {
  enabled: false,
  placement: 'outside',
  mode: 'display_only',
  showPatientNames: false,
  calledTextPreset: 'please_enter',
  calledTextCustom: null,
  arrivedTextPreset: 'please_wait_here',
  arrivedTextCustom: null,
};

function isRoomPanelPlacement(value: unknown): value is RoomPanelPlacement {
  return (
    typeof value === 'string' &&
    (ROOM_PANEL_PLACEMENTS as readonly string[]).includes(value)
  );
}

function isRoomPanelMode(value: unknown): value is RoomPanelMode {
  return typeof value === 'string' && (ROOM_PANEL_MODES as readonly string[]).includes(value);
}

function isRoomPanelTextPreset(value: unknown): value is RoomPanelTextPreset {
  return (
    typeof value === 'string' &&
    (ROOM_PANEL_TEXT_PRESETS as readonly string[]).includes(value)
  );
}

/** Trim and truncate custom panel text; empty → null. */
export function normalizeRoomPanelCustomText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed.slice(0, ROOM_PANEL_CUSTOM_TEXT_MAX_LENGTH) : null;
}

/**
 * Canonical room-panel settings normalize (enums, outside constraints, custom text).
 * Accepts partial/unknown fields and coerces to defaults.
 */
export function normalizeRoomPanelSettings(
  panel: Partial<RoomPanelSettings> | null | undefined,
): RoomPanelSettings {
  const source = panel ?? DEFAULT_ROOM_PANEL_SETTINGS;
  const placement = isRoomPanelPlacement(source.placement)
    ? source.placement
    : DEFAULT_ROOM_PANEL_SETTINGS.placement;
  let mode = isRoomPanelMode(source.mode) ? source.mode : DEFAULT_ROOM_PANEL_SETTINGS.mode;
  if (placement === 'outside' && mode === 'staff_full') {
    mode = 'arrival';
  }

  return {
    enabled: source.enabled === true,
    placement,
    mode,
    showPatientNames: placement === 'inside' && source.showPatientNames === true,
    calledTextPreset: isRoomPanelTextPreset(source.calledTextPreset)
      ? source.calledTextPreset
      : DEFAULT_ROOM_PANEL_SETTINGS.calledTextPreset,
    calledTextCustom: normalizeRoomPanelCustomText(source.calledTextCustom),
    arrivedTextPreset: isRoomPanelTextPreset(source.arrivedTextPreset)
      ? source.arrivedTextPreset
      : DEFAULT_ROOM_PANEL_SETTINGS.arrivedTextPreset,
    arrivedTextCustom: normalizeRoomPanelCustomText(source.arrivedTextCustom),
  };
}

export function applyRoomPanelPlacement(
  settings: RoomPanelSettings,
  placement: RoomPanelPlacement,
): RoomPanelSettings {
  return normalizeRoomPanelSettings({ ...settings, placement });
}
