import { cookieAuthFetch } from '$lib/api/cookie-auth-fetch';
import { normalizeTopicAccentColor } from '$lib/topics/topic-accent';
import type {
  MfaPatchOpsSettingsBody,
  OpsSettingsResponse,
  PracticeRoom,
  PracticeTopicSetting,
} from '$lib/ops/openapi-types';
import { ensureSingleDefaultCallTarget } from './room-default-call-target';
import { normalizeMaxOccupancy } from './room-capacity';
import { isValidConfigurableTopicId as isValidTopicId, slugifyTopicId } from '@praxis-flow/domain';

export type {
  MfaPatchOpsSettingsBody as PatchOpsSettingsBody,
  PracticeRoom,
  PracticeTopicSetting,
  OpsSettingsResponse,
} from '$lib/ops/openapi-types';
export { isValidTopicId, slugifyTopicId };

export const ROOM_PANEL_PLACEMENTS = ['outside', 'inside'] as const;
export const ROOM_PANEL_MODES = ['display_only', 'arrival', 'staff_full'] as const;
export const ROOM_PANEL_TEXT_PRESETS = [
  'you_are_right',
  'please_wait_here',
  'please_enter',
  'go_to_reception',
  'custom',
] as const;

export type RoomPanelSettings = NonNullable<PracticeRoom['panel']>;
export type RoomPanelMode = RoomPanelSettings['mode'];
export type RoomPanelPlacement = RoomPanelSettings['placement'];
export type RoomPanelTextPreset = RoomPanelSettings['calledTextPreset'];
export type PracticeRoomWithPanel = PracticeRoom;

export async function fetchOpsSettings() {
  return cookieAuthFetch<OpsSettingsResponse>('/api/v1/ops/settings');
}

let inflightOpsSettings: Promise<Awaited<ReturnType<typeof fetchOpsSettings>>> | null = null;

/** Coalesce parallel MFA settings requests (layout + dashboard mount in the same tick). */
export async function fetchOpsSettingsDeduped() {
  inflightOpsSettings ??= fetchOpsSettings().finally(() => {
    inflightOpsSettings = null;
  });
  return inflightOpsSettings;
}

export async function patchOpsSettings(body: MfaPatchOpsSettingsBody) {
  return cookieAuthFetch<OpsSettingsResponse>('/api/v1/ops/settings', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export {
  listEnabledRooms,
  defaultCallRoom,
  ensureSingleDefaultCallTarget,
  resolveDefaultCallRoomId,
} from './room-default-call-target';

const ROOM_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ROOM_ID_PREFIX = 'r';
const ROOM_ID_RANDOM_LENGTH = 6;
const ROOM_ID_RANDOM_ATTEMPTS = 32;

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

export function isValidRoomId(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 64 && ROOM_ID_PATTERN.test(trimmed);
}

function randomRoomIdToken(length: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(length);
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.getRandomValues === 'function'
  ) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  let token = '';
  for (const byte of bytes) {
    token += alphabet[byte % alphabet.length];
  }
  return token;
}

export function generateRoomId(roomIdsTaken: ReadonlySet<string>): string {
  for (let attempt = 0; attempt < ROOM_ID_RANDOM_ATTEMPTS; attempt += 1) {
    const candidate = `${ROOM_ID_PREFIX}${randomRoomIdToken(ROOM_ID_RANDOM_LENGTH)}`;
    if (!roomIdsTaken.has(candidate)) {
      return candidate;
    }
  }

  for (let suffix = 0; ; suffix += 1) {
    const token = suffix.toString(36).padStart(ROOM_ID_RANDOM_LENGTH, '0');
    const candidate = `${ROOM_ID_PREFIX}${token}`;
    if (!roomIdsTaken.has(candidate)) {
      return candidate;
    }
  }
}

export function normalizeRoomIdInput(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeRoomPanelSettings(
  panel: RoomPanelSettings | null | undefined,
): RoomPanelSettings {
  const source = panel ?? DEFAULT_ROOM_PANEL_SETTINGS;
  const normalized: RoomPanelSettings = {
    enabled: source.enabled === true,
    placement: ROOM_PANEL_PLACEMENTS.includes(source.placement)
      ? source.placement
      : DEFAULT_ROOM_PANEL_SETTINGS.placement,
    mode: ROOM_PANEL_MODES.includes(source.mode) ? source.mode : DEFAULT_ROOM_PANEL_SETTINGS.mode,
    showPatientNames: source.placement === 'inside' && source.showPatientNames === true,
    calledTextPreset: ROOM_PANEL_TEXT_PRESETS.includes(source.calledTextPreset)
      ? source.calledTextPreset
      : DEFAULT_ROOM_PANEL_SETTINGS.calledTextPreset,
    calledTextCustom: source.calledTextCustom?.trim().slice(0, 80) || null,
    arrivedTextPreset: ROOM_PANEL_TEXT_PRESETS.includes(source.arrivedTextPreset)
      ? source.arrivedTextPreset
      : DEFAULT_ROOM_PANEL_SETTINGS.arrivedTextPreset,
    arrivedTextCustom: source.arrivedTextCustom?.trim().slice(0, 80) || null,
  };

  if (normalized.placement === 'outside' && normalized.mode === 'staff_full') {
    normalized.mode = 'arrival';
  }

  return normalized;
}

export function roomPanelSettingsOrDefault(room: PracticeRoomWithPanel): RoomPanelSettings {
  return {
    ...DEFAULT_ROOM_PANEL_SETTINGS,
    ...(room.panel ?? {}),
  };
}

export function normalizeRoomsForSave(rooms: PracticeRoomWithPanel[]): PracticeRoomWithPanel[] {
  const normalized = rooms
    .map((room) => {
      return {
        roomId: normalizeRoomIdInput(room.roomId),
        roomLabel: room.roomLabel.trim(),
        enabled: room.enabled,
        defaultCallTarget: room.defaultCallTarget === true,
        maxOccupancy: normalizeMaxOccupancy(room.maxOccupancy ?? null),
        panel: normalizeRoomPanelSettings(room.panel),
      };
    })
    .filter((room) => room.roomId.length > 0 && room.roomLabel.length > 0);
  return ensureSingleDefaultCallTarget(normalized);
}

export function normalizeTopicsForSave(topics: PracticeTopicSetting[]): PracticeTopicSetting[] {
  return topics.map((topic, index) => ({
    ...topic,
    label: topic.label.trim(),
    laneCode: topic.laneCode.trim().toUpperCase().slice(0, 1),
    defaultRoomId: topic.defaultRoomId.trim(),
    iconId: topic.iconId?.trim() || null,
    accentColor: normalizeTopicAccentColor(topic.accentColor),
    availableFrom: topic.availableFrom?.trim() || null,
    availableTo: topic.availableTo?.trim() || null,
    sortOrder: index + 1,
  }));
}

export function topicTimeWindowLabel(topic: PracticeTopicSetting): string {
  if (topic.availableFrom && topic.availableTo) {
    return `${topic.availableFrom}–${topic.availableTo}`;
  }
  return '—';
}
