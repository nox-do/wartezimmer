const HEX6 = /^#[0-9A-Fa-f]{6}$/;

/** Preset swatches for MFA topic editor and fallbacks. */
export const TOPIC_ACCENT_PRESETS = [
  '#18181b',
  '#7c3aed',
  '#0369a1',
  '#0f766e',
  '#b45309',
  '#dc2626',
  '#ea580c',
  '#ca8a04',
  '#16a34a',
  '#2563eb',
  '#db2777',
  '#64748b',
] as const;

const LANE_DEFAULT_ACCENT: Record<string, string> = {
  A: '#18181b',
  L: '#7c3aed',
  R: '#0369a1',
  O: '#0f766e',
  M: '#b45309',
};

export const DEFAULT_TOPIC_ACCENT = TOPIC_ACCENT_PRESETS[0];

export function isValidTopicAccentColor(value: string): boolean {
  return HEX6.test(value.trim());
}

export function normalizeTopicAccentColor(
  value: unknown,
  fallback: string = DEFAULT_TOPIC_ACCENT,
): string {
  if (typeof value === 'string' && isValidTopicAccentColor(value)) {
    return value.trim().toLowerCase();
  }
  if (isValidTopicAccentColor(fallback)) {
    return fallback.trim().toLowerCase();
  }
  return DEFAULT_TOPIC_ACCENT;
}

export function defaultAccentForLane(laneCode: string): string {
  const lane = laneCode.trim().toUpperCase();
  return LANE_DEFAULT_ACCENT[lane] ?? DEFAULT_TOPIC_ACCENT;
}

export function textColorOnAccent(background: string): '#ffffff' | '#18181b' {
  const hex = background.replace('#', '');
  if (hex.length !== 6) {
    return '#ffffff';
  }
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#18181b' : '#ffffff';
}
