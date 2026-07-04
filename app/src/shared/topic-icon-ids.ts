/** Curated Lucide icon ids allowed for terminal topics (kebab-case). */
export const TOPIC_ICON_IDS = [
  'activity',
  'ambulance',
  'baby',
  'bandage',
  'bone',
  'brain',
  'briefcase-medical',
  'calendar-check',
  'calendar-heart',
  'calendar-plus',
  'clipboard-list',
  'clipboard-plus',
  'clock',
  'cross',
  'dna',
  'droplet',
  'ear',
  'eye',
  'file-heart',
  'file-text',
  'flask-conical',
  'hand-heart',
  'hand-helping',
  'heart-handshake',
  'heart-pulse',
  'hospital',
  'message-circle',
  'microscope',
  'phone',
  'pill',
  'pill-bottle',
  'radiation',
  'scan',
  'scan-heart',
  'scissors',
  'shield-plus',
  'smile',
  'speech',
  'stethoscope',
  'syringe',
  'tablets',
  'test-tubes',
  'thermometer',
  'user-round',
  'users',
  'accessibility',
] as const;

export type TopicIconId = (typeof TOPIC_ICON_IDS)[number];

export function isValidTopicIconId(value: string): value is TopicIconId {
  return (TOPIC_ICON_IDS as readonly string[]).includes(value);
}

export function normalizeTopicIconId(value: unknown): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return isValidTopicIconId(trimmed) ? trimmed : null;
}
