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

/** Per-placement config (outside | inside) without the placement key itself. */
export type RoomPanelPlacementConfig = {
  enabled: boolean;
  mode: RoomPanelMode;
  showPatientNames: boolean;
  /** Inside panels only — enables queue call from the room tablet (WZ-TV announcement still required). */
  allowCalling: boolean;
  calledTextPreset: RoomPanelTextPreset;
  calledTextCustom: string | null;
  arrivedTextPreset: RoomPanelTextPreset;
  arrivedTextCustom: string | null;
};

export type RoomPanelsSettings = {
  outside: RoomPanelPlacementConfig;
  inside: RoomPanelPlacementConfig;
};

/** Input shape for normalizeRoomPanelsSettings — each placement may be partial or omitted. */
export type PartialRoomPanelsSettings = {
  outside?: Partial<RoomPanelPlacementConfig> | null;
  inside?: Partial<RoomPanelPlacementConfig> | null;
};

export const DEFAULT_ROOM_PANEL_PLACEMENT_CONFIG: RoomPanelPlacementConfig = {
  enabled: false,
  mode: 'display_only',
  showPatientNames: false,
  allowCalling: false,
  calledTextPreset: 'please_enter',
  calledTextCustom: null,
  arrivedTextPreset: 'please_wait_here',
  arrivedTextCustom: null,
};

export const DEFAULT_ROOM_PANELS_SETTINGS: RoomPanelsSettings = {
  outside: { ...DEFAULT_ROOM_PANEL_PLACEMENT_CONFIG },
  inside: { ...DEFAULT_ROOM_PANEL_PLACEMENT_CONFIG },
};

/** Minimal room shape for panel helpers (ops settings, API responses). */
export type RoomWithPanels = {
  panels?: PartialRoomPanelsSettings | RoomPanelsSettings | null;
};

export function roomPanelsOrDefault(room: RoomWithPanels): RoomPanelsSettings {
  return normalizeRoomPanelsSettings(room.panels);
}

export function roomPanelConfigForPlacement(
  room: RoomWithPanels,
  placement: RoomPanelPlacement,
): RoomPanelPlacementConfig {
  return normalizeRoomPanelPlacementConfig(placement, roomPanelsOrDefault(room)[placement]);
}

export function roomHasAnyEnabledPanel(room: RoomWithPanels): boolean {
  const panels = roomPanelsOrDefault(room);
  return panels.outside.enabled || panels.inside.enabled;
}

export function listEnabledRoomPanelPlacements(room: RoomWithPanels): RoomPanelPlacement[] {
  const panels = roomPanelsOrDefault(room);
  const enabled: RoomPanelPlacement[] = [];
  if (panels.outside.enabled) enabled.push('outside');
  if (panels.inside.enabled) enabled.push('inside');
  return enabled;
}

function isRoomPanelMode(value: unknown): value is RoomPanelMode {
  return typeof value === 'string' && (ROOM_PANEL_MODES as readonly string[]).includes(value);
}

function isRoomPanelTextPreset(value: unknown): value is RoomPanelTextPreset {
  return (
    typeof value === 'string' && (ROOM_PANEL_TEXT_PRESETS as readonly string[]).includes(value)
  );
}

/** Trim and truncate custom panel text; empty → null. */
export function normalizeRoomPanelCustomText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed.slice(0, ROOM_PANEL_CUSTOM_TEXT_MAX_LENGTH) : null;
}

function normalizeRoomPanelTextFields(
  source: Partial<RoomPanelPlacementConfig>,
): Pick<
  RoomPanelPlacementConfig,
  'calledTextPreset' | 'calledTextCustom' | 'arrivedTextPreset' | 'arrivedTextCustom'
> {
  return {
    calledTextPreset: isRoomPanelTextPreset(source.calledTextPreset)
      ? source.calledTextPreset
      : DEFAULT_ROOM_PANEL_PLACEMENT_CONFIG.calledTextPreset,
    calledTextCustom: normalizeRoomPanelCustomText(source.calledTextCustom),
    arrivedTextPreset: isRoomPanelTextPreset(source.arrivedTextPreset)
      ? source.arrivedTextPreset
      : DEFAULT_ROOM_PANEL_PLACEMENT_CONFIG.arrivedTextPreset,
    arrivedTextCustom: normalizeRoomPanelCustomText(source.arrivedTextCustom),
  };
}

/**
 * Canonical per-placement normalize (enums, outside constraints, custom text).
 * Accepts partial/unknown fields and coerces to defaults.
 */
export function normalizeRoomPanelPlacementConfig(
  placement: RoomPanelPlacement,
  config: Partial<RoomPanelPlacementConfig> | null | undefined,
): RoomPanelPlacementConfig {
  const source = config ?? DEFAULT_ROOM_PANEL_PLACEMENT_CONFIG;
  let mode = isRoomPanelMode(source.mode) ? source.mode : DEFAULT_ROOM_PANEL_PLACEMENT_CONFIG.mode;
  if (placement === 'outside' && mode === 'staff_full') {
    mode = 'arrival';
  }

  return {
    enabled: source.enabled === true,
    mode,
    showPatientNames: placement === 'inside' && source.showPatientNames === true,
    allowCalling: placement === 'inside' && mode === 'staff_full' && source.allowCalling === true,
    ...normalizeRoomPanelTextFields(source),
  };
}

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

/** Which preset/custom applies for live display — locale strings are resolved in the UI. */
export function resolveRoomPanelDisplayTextConfig(
  preset: RoomPanelTextPreset,
  custom: string | null,
  fallbackPreset: RoomPanelTextPreset,
): { preset: RoomPanelTextPreset; custom: string | null } {
  if (preset === 'custom') {
    const trimmed = normalizeRoomPanelCustomText(custom);
    if (trimmed) {
      return { preset: 'custom', custom: trimmed };
    }
    return { preset: fallbackPreset, custom: null };
  }
  return { preset, custom: null };
}

/** Canonical dual-placement normalize. */
export function normalizeRoomPanelsSettings(
  panels: PartialRoomPanelsSettings | null | undefined,
): RoomPanelsSettings {
  const source = panels ?? {};
  return {
    outside: normalizeRoomPanelPlacementConfig('outside', source.outside),
    inside: normalizeRoomPanelPlacementConfig('inside', source.inside),
  };
}
