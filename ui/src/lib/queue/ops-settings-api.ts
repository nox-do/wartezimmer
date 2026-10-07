import { mfaAuthFetch } from '$lib/api/staff-auth-fetch';
import { normalizeTopicAccentColor } from '$lib/topics/topic-accent';
import type {
  MfaPatchOpsSettingsBody,
  OpsSettingsResponse,
  PracticeRoom,
  PracticeTopicSetting,
} from '$lib/ops/openapi-types';
import { ensureSingleDefaultCallTarget } from './room-default-call-target';
import { normalizeMaxOccupancy } from './room-capacity';
import {
  DEFAULT_ROOM_PANELS_SETTINGS,
  isValidConfigurableTopicId as isValidTopicId,
  listEnabledRoomPanelPlacements,
  normalizeRoomPanelsSettings,
  roomHasAnyEnabledPanel,
  roomPanelConfigForPlacement,
  roomPanelsOrDefault,
  ROOM_PANEL_CUSTOM_TEXT_MAX_LENGTH,
  ROOM_PANEL_MODES,
  ROOM_PANEL_PLACEMENTS,
  ROOM_PANEL_TEXT_PRESETS,
  slugifyTopicId,
  type RoomPanelMode,
  type RoomPanelPlacement,
  type RoomPanelPlacementConfig,
  type RoomPanelsSettings,
  type RoomPanelTextPreset,
} from '@wartezimmer/domain';

export type {
  MfaPatchOpsSettingsBody as PatchOpsSettingsBody,
  PracticeRoom,
  PracticeTopicSetting,
  OpsSettingsResponse,
} from '$lib/ops/openapi-types';
export { isValidTopicId, slugifyTopicId };

export {
  DEFAULT_ROOM_PANELS_SETTINGS,
  ROOM_PANEL_CUSTOM_TEXT_MAX_LENGTH,
  ROOM_PANEL_MODES,
  ROOM_PANEL_PLACEMENTS,
  ROOM_PANEL_TEXT_PRESETS,
  listEnabledRoomPanelPlacements,
  roomHasAnyEnabledPanel,
  roomPanelConfigForPlacement,
  roomPanelsOrDefault,
  type RoomPanelMode,
  type RoomPanelPlacement,
  type RoomPanelPlacementConfig,
  type RoomPanelsSettings,
  type RoomPanelTextPreset,
};

export type PracticeRoomWithPanels = PracticeRoom;

export async function fetchOpsSettings() {
  return mfaAuthFetch<OpsSettingsResponse>('/api/v1/ops/settings');
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
  return mfaAuthFetch<OpsSettingsResponse>('/api/v1/ops/settings', {
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

export function emptyRoomPanels(): PracticeRoomWithPanels {
  return {
    roomId: '',
    roomLabel: '',
    enabled: true,
    defaultCallTarget: false,
    maxOccupancy: null,
    panels: { ...DEFAULT_ROOM_PANELS_SETTINGS },
  };
}

export function normalizeRoomsForSave(rooms: PracticeRoomWithPanels[]): PracticeRoomWithPanels[] {
  const normalized = rooms
    .map((room) => {
      return {
        roomId: normalizeRoomIdInput(room.roomId),
        roomLabel: room.roomLabel.trim(),
        enabled: room.enabled,
        defaultCallTarget: room.defaultCallTarget === true,
        maxOccupancy: normalizeMaxOccupancy(room.maxOccupancy ?? null),
        panels: normalizeRoomPanelsSettings(room.panels),
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
