import { isValidConfigurableTopicId, MFA_ASSIST_TOPIC_ID } from './checkin-topics.js';
import type { OpsSettings } from './db/db-types.js';
import {
  getBusinessMinutesOfDay,
  isPracticeOpenAt,
  isTopicAvailableAt,
  resolveBusinessTimeZone,
} from './practice-time-windows.js';
import { isValidTopicIconId, normalizeTopicIconId } from './topic-icon-ids.js';
import {
  defaultAccentForLane,
  isReservedLaneCode,
  isValidLaneCode,
  isValidTopicAccentColor,
  MFA_ASSIST_LANE_CODE,
  normalizeLaneCode,
  normalizeTopicAccentColor,
} from '@praxis-flow/domain';

export type TopicSetting = OpsSettings['topics'][number];
/** `defaultRoomId` wird im Simple-Routing-Sync zu `RoutingRule.initialTargetLocationId`. */

export {
  MFA_ASSIST_TOPIC_ID,
  MFA_ASSIST_LANE_CODE,
  isReservedLaneCode,
  isValidLaneCode,
  normalizeLaneCode,
};

const DEFAULT_CENTRAL_ROOM_ID = 'mfa-tresen';

export const DEFAULT_TERMINAL_TOPIC_DEFINITIONS: TopicSetting[] = [
  {
    topicId: 'blut',
    label: 'Blutabnahme',
    laneCode: 'L',
    defaultRoomId: DEFAULT_CENTRAL_ROOM_ID,
    iconId: 'droplet',
    accentColor: '#7c3aed',
    enabled: true,
    availableFrom: null,
    availableTo: null,
    sortOrder: 1,
  },
  {
    topicId: 'termin-habe',
    label: 'Ich habe einen Termin',
    laneCode: 'A',
    defaultRoomId: DEFAULT_CENTRAL_ROOM_ID,
    iconId: 'calendar-check',
    accentColor: '#18181b',
    enabled: true,
    availableFrom: null,
    availableTo: null,
    sortOrder: 2,
  },
  {
    topicId: 'termin-brauche',
    label: 'Ich brauche einen Termin',
    laneCode: 'A',
    defaultRoomId: DEFAULT_CENTRAL_ROOM_ID,
    iconId: 'calendar-plus',
    accentColor: '#2563eb',
    enabled: true,
    availableFrom: null,
    availableTo: null,
    sortOrder: 3,
  },
  {
    topicId: 'offen',
    label: 'Offene Sprechstunde',
    laneCode: 'O',
    defaultRoomId: DEFAULT_CENTRAL_ROOM_ID,
    iconId: 'clock',
    accentColor: '#0f766e',
    enabled: true,
    availableFrom: null,
    availableTo: null,
    sortOrder: 4,
  },
  {
    topicId: 'rezept',
    label: 'Rezept / Überweisung',
    laneCode: 'R',
    defaultRoomId: DEFAULT_CENTRAL_ROOM_ID,
    iconId: 'pill',
    accentColor: '#0369a1',
    enabled: true,
    availableFrom: null,
    availableTo: null,
    sortOrder: 5,
  },
];

const DEFAULT_BY_TOPIC_ID = new Map(
  DEFAULT_TERMINAL_TOPIC_DEFINITIONS.map((topic) => [topic.topicId, topic]),
);

function readNonEmptyString(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return fallback;
}

function readNullableTimeField(value: unknown, defaultValue: string | null): string | null {
  if (typeof value === 'string') {
    return value.trim() || null;
  }
  if (value === null) {
    return null;
  }
  return defaultValue;
}

function readNullableId(value: unknown, fallback: string | null): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

function readTopicIconId(value: unknown, fallback: string | null): string | null {
  if (value === null) {
    return null;
  }
  return normalizeTopicIconId(value) ?? fallback;
}

/** Loose JSON parse: preserve string/null, omit undefined fields for normalize defaults. */
export function readPartialNullableTimeField(value: unknown): string | null | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (value === null) {
    return null;
  }
  return undefined;
}

/** Loose JSON parse: preserve string/null, omit undefined fields for normalize defaults. */
export function readPartialNullableId(value: unknown): string | null | undefined {
  return readPartialNullableTimeField(value);
}

function readLaneCodeFromPartial(
  entry: Partial<TopicSetting> & { prefix?: string },
): string | undefined {
  if (typeof entry.laneCode === 'string' && isValidLaneCode(entry.laneCode)) {
    return normalizeLaneCode(entry.laneCode);
  }
  if (typeof entry.prefix === 'string' && isValidLaneCode(entry.prefix)) {
    return normalizeLaneCode(entry.prefix);
  }
  return undefined;
}

function normalizeSingleTopic(
  entry: Partial<TopicSetting> & { prefix?: string },
): TopicSetting | null {
  const topicId = typeof entry.topicId === 'string' ? entry.topicId.trim() : '';
  if (!isValidConfigurableTopicId(topicId)) {
    return null;
  }

  const defaults = DEFAULT_BY_TOPIC_ID.get(topicId);
  const laneCode = readLaneCodeFromPartial(entry) ?? defaults?.laneCode ?? 'A';

  return {
    topicId,
    label: readNonEmptyString(entry.label, defaults?.label ?? topicId),
    laneCode,
    defaultRoomId: readNonEmptyString(
      entry.defaultRoomId,
      defaults?.defaultRoomId ?? DEFAULT_CENTRAL_ROOM_ID,
    ),
    iconId: readTopicIconId(entry.iconId, defaults?.iconId ?? null),
    accentColor: normalizeTopicAccentColor(
      entry.accentColor,
      defaults?.accentColor ?? defaultAccentForLane(laneCode),
    ),
    enabled: readBoolean(entry.enabled, defaults?.enabled ?? true),
    availableFrom: readNullableTimeField(entry.availableFrom, defaults?.availableFrom ?? null),
    availableTo: readNullableTimeField(entry.availableTo, defaults?.availableTo ?? null),
    sortOrder: readNumber(entry.sortOrder, defaults?.sortOrder ?? 99),
    journeyTemplateId: readNullableId(entry.journeyTemplateId, defaults?.journeyTemplateId ?? null),
  };
}

export function normalizeTopicSettingsList(parsed: Partial<TopicSetting>[]): TopicSetting[] {
  const byId = new Map<string, Partial<TopicSetting>>();
  for (const entry of parsed) {
    if (typeof entry.topicId === 'string' && isValidConfigurableTopicId(entry.topicId.trim())) {
      byId.set(entry.topicId.trim(), {
        ...byId.get(entry.topicId.trim()),
        ...entry,
        topicId: entry.topicId.trim(),
      });
    }
  }

  const merged = [...byId.values()]
    .map((entry) => normalizeSingleTopic(entry))
    .filter((entry): entry is TopicSetting => entry != null);

  if (merged.length === 0) {
    throw new Error('OPS_SETTINGS_INVALID', {
      cause: new Error('At least one valid topic is required.'),
    });
  }

  return merged.sort((a, b) => a.sortOrder - b.sortOrder || a.topicId.localeCompare(b.topicId));
}

export function resolveTicketLaneCodeFromSettings(
  settings: Pick<OpsSettings, 'topics'>,
  topicId: string,
): string {
  if (topicId === MFA_ASSIST_TOPIC_ID) {
    return MFA_ASSIST_LANE_CODE;
  }

  const topic = settings.topics.find((entry) => entry.topicId === topicId);
  if (!topic) {
    throw new Error('UNKNOWN_TOPIC');
  }
  if (!isValidLaneCode(topic.laneCode)) {
    throw new Error('OPS_SETTINGS_INVALID');
  }
  return normalizeLaneCode(topic.laneCode);
}

export function resolveTopicLabelFromSettings(
  settings: Pick<OpsSettings, 'topics'>,
  topicId: string,
): string {
  if (topicId === MFA_ASSIST_TOPIC_ID) {
    return 'Zur MFA';
  }

  const topic = settings.topics.find((entry) => entry.topicId === topicId);
  if (!topic) {
    throw new Error('UNKNOWN_TOPIC');
  }
  return topic.label.trim();
}

export function resolveDefaultRoomForTopic(
  settings: Pick<OpsSettings, 'topics' | 'rooms'>,
  topicId: string,
): OpsSettings['rooms'][number] | undefined {
  const topic = settings.topics.find((entry) => entry.topicId === topicId);
  if (!topic) {
    return undefined;
  }
  return settings.rooms.find((room) => room.enabled && room.roomId === topic.defaultRoomId);
}

function resolveDefaultCallRoom(
  settings: Pick<OpsSettings, 'rooms'>,
): OpsSettings['rooms'][number] | undefined {
  const enabled = settings.rooms.filter(
    (room) => room.enabled && room.roomId.trim().length > 0 && room.roomLabel.trim().length > 0,
  );
  if (enabled.length === 0) {
    return undefined;
  }
  return enabled.find((entry) => entry.defaultCallTarget) ?? enabled[0];
}

function resolveDefaultCallRoomLabel(settings: Pick<OpsSettings, 'rooms'>): string | null {
  const room = resolveDefaultCallRoom(settings);
  return room?.roomLabel.trim() || null;
}

export function resolveDestinationRoomForTopic(
  settings: Pick<OpsSettings, 'topics' | 'rooms'>,
  topicId: string,
): { roomId: string; roomLabel: string } | null {
  if (topicId === MFA_ASSIST_TOPIC_ID) {
    const room = resolveDefaultCallRoom(settings);
    if (!room) {
      return null;
    }
    return { roomId: room.roomId, roomLabel: room.roomLabel.trim() };
  }

  const room = resolveDefaultRoomForTopic(settings, topicId);
  if (room?.roomLabel.trim()) {
    return { roomId: room.roomId, roomLabel: room.roomLabel.trim() };
  }

  const fallback = resolveDefaultCallRoom(settings);
  if (!fallback) {
    return null;
  }
  return { roomId: fallback.roomId, roomLabel: fallback.roomLabel.trim() };
}

/** Room label shown on the terminal confirmation screen after check-in. */
export function resolveDestinationRoomLabelForTopic(
  settings: Pick<OpsSettings, 'topics' | 'rooms'>,
  topicId: string,
): string | null {
  if (topicId === MFA_ASSIST_TOPIC_ID) {
    return resolveDefaultCallRoomLabel(settings);
  }

  const room = resolveDefaultRoomForTopic(settings, topicId);
  return room?.roomLabel.trim() || resolveDefaultCallRoomLabel(settings);
}

/**
 * Room label from the visit's operative target (journey step / routing rule).
 * No topic-default fallback — that can disagree with the actual route.
 */
export function resolveCheckInDestinationRoomLabel(
  visitTarget?: { publicName?: string | null; name?: string | null } | null,
): string | null {
  return visitTarget?.publicName?.trim() || visitTarget?.name?.trim() || null;
}

export function validateTopicSettings(
  topics: TopicSetting[],
  rooms: OpsSettings['rooms'],
): { ok: true } | { ok: false; message: string } {
  // Authoritative topic-settings validation (client UX prechecks mirror lane/time-window rules only).
  if (topics.length === 0) {
    return { ok: false, message: 'At least one topic is required.' };
  }

  const enabledRoomIds = new Set(rooms.filter((room) => room.enabled).map((room) => room.roomId));
  const seenTopicIds = new Set<string>();

  for (const topic of topics) {
    if (!isValidConfigurableTopicId(topic.topicId)) {
      return { ok: false, message: `Invalid topicId: ${topic.topicId}` };
    }
    if (seenTopicIds.has(topic.topicId)) {
      return { ok: false, message: `Duplicate topicId: ${topic.topicId}` };
    }
    seenTopicIds.add(topic.topicId);
    if (topic.label.trim().length === 0) {
      return { ok: false, message: `Topic ${topic.topicId} requires a label.` };
    }
    if (!isValidLaneCode(topic.laneCode)) {
      return {
        ok: false,
        message: `Topic ${topic.topicId} requires a single-letter lane code A-Z.`,
      };
    }
    if (isReservedLaneCode(topic.laneCode)) {
      return { ok: false, message: `Topic ${topic.topicId} cannot use reserved lane code M.` };
    }
    if (!enabledRoomIds.has(topic.defaultRoomId)) {
      return { ok: false, message: `Topic ${topic.topicId} defaultRoomId is not an enabled room.` };
    }
    if (topic.iconId != null && !isValidTopicIconId(topic.iconId)) {
      return { ok: false, message: `Topic ${topic.topicId} has an invalid iconId.` };
    }
    if (!isValidTopicAccentColor(topic.accentColor)) {
      return { ok: false, message: `Topic ${topic.topicId} has an invalid accentColor.` };
    }
    const hasFrom = topic.availableFrom != null;
    const hasTo = topic.availableTo != null;
    if (hasFrom !== hasTo) {
      return {
        ok: false,
        message: `Topic ${topic.topicId} time window requires both from and to.`,
      };
    }
  }

  return { ok: true };
}

export function terminalTopicsForUi(
  settings: Pick<OpsSettings, 'topics' | 'practiceOpenFrom' | 'practiceOpenTo'>,
  nowMinutes: number = getBusinessMinutesOfDay(resolveBusinessTimeZone()),
): TopicSetting[] {
  if (!isPracticeOpenAt(settings, nowMinutes)) {
    return [];
  }

  return settings.topics
    .filter(
      (topic) => isValidConfigurableTopicId(topic.topicId) && isTopicAvailableAt(topic, nowMinutes),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder || a.topicId.localeCompare(b.topicId));
}
