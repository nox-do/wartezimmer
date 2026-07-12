import {
  applyMfaPracticeRooms,
  applyMfaPracticeTopics,
} from '$lib/mfa/mfa-practice-context.svelte';
import type { JourneySettings } from '$lib/ops/openapi-types';
import {
  fetchOpsSettings,
  isValidRoomId,
  isValidTopicId,
  normalizeRoomsForSave,
  normalizeTopicsForSave,
  patchOpsSettings,
  type PracticeRoomWithPanels,
  type PracticeTopicSetting,
} from '$lib/queue/ops-settings-api';
import { roomGuardErrorMessage, type RoomQueueGuardContext } from '$lib/queue/room-removal-guard';
import {
  formatTopicLabels,
  isReservedLaneCode,
  topicsReferencingMissingRooms,
} from '$lib/queue/topic-settings-form';
import { isValidLaneCode } from '@praxis-flow/domain';
import { validateTopicTimeWindow } from '$lib/queue/time-of-day';
import {
  fetchRoutingCapabilities,
  type RoutingCapabilities,
} from '$lib/mfa/practice-ops-api';
import { t, tf } from '$lib/i18n/i18nStore.svelte';
import { toastStore } from '$lib/stores/toastStore';

export type TopicsRoomsSettings = {
  rooms: PracticeRoomWithPanels[];
  topics: PracticeTopicSetting[];
  journeySettings: JourneySettings;
  routingCapabilities: RoutingCapabilities;
  savedTopicsSnapshot: string;
};

export type PersistTopicsRoomsOptions = {
  silent?: boolean;
  routingCapabilities?: RoutingCapabilities | null;
  roomQueueGuardContext?: RoomQueueGuardContext;
};

function sortedTopics(topics: PracticeTopicSetting[]): PracticeTopicSetting[] {
  return [...topics].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.topicId.localeCompare(b.topicId),
  );
}

export async function loadTopicsRoomsSettings(): Promise<TopicsRoomsSettings | null> {
  const [result, capabilitiesResult] = await Promise.all([
    fetchOpsSettings(),
    fetchRoutingCapabilities(),
  ]);
  if (!result.ok) {
    toastStore.error(result.error.message || t('mfa.settings.settingsLoadError'));
    return null;
  }
  if (!capabilitiesResult.ok) {
    toastStore.error(capabilitiesResult.error.message || t('mfa.settings.settingsLoadError'));
    return null;
  }

  const topics = sortedTopics(result.data.topics);
  applyMfaPracticeRooms(result.data.rooms);
  applyMfaPracticeTopics(topics);

  return {
    rooms: [...result.data.rooms],
    topics,
    journeySettings: structuredClone(result.data.journeySettings),
    routingCapabilities: capabilitiesResult.data,
    savedTopicsSnapshot: JSON.stringify(normalizeTopicsForSave(topics)),
  };
}

export async function persistTopicsRoomsSettings(
  rooms: PracticeRoomWithPanels[],
  topics: PracticeTopicSetting[],
  options?: PersistTopicsRoomsOptions,
): Promise<TopicsRoomsSettings | null> {
  const normalizedRooms = normalizeRoomsForSave(rooms);
  const normalizedTopics = normalizeTopicsForSave(topics);

  if (normalizedRooms.length === 0) {
    toastStore.error(t('mfa.settings.roomsSaveNeedOne'));
    return null;
  }

  const roomIds = new Set<string>();
  for (const room of normalizedRooms) {
    if (!isValidRoomId(room.roomId)) {
      toastStore.error(t('mfa.settings.roomIdInvalid'));
      return null;
    }
    if (roomIds.has(room.roomId)) {
      toastStore.error(t('mfa.settings.roomIdDuplicate'));
      return null;
    }
    roomIds.add(room.roomId);
  }

  if (normalizedTopics.length === 0) {
    toastStore.error(t('mfa.settings.topicsNeedOne'));
    return null;
  }

  // Do not auto-reassign topic default rooms — block remove/rename while topics still point here.
  const topicsOnMissingRooms = topicsReferencingMissingRooms(normalizedTopics, normalizedRooms);
  if (topicsOnMissingRooms.length > 0) {
    toastStore.error(
      tf('mfa.settings.roomRemoveBlockedTopics', {
        topics: formatTopicLabels(topicsOnMissingRooms),
      }),
    );
    return null;
  }

  // UX-only precheck — server `validateTopicSettings` remains authoritative.
  for (const topic of normalizedTopics) {
    if (!isValidTopicId(topic.topicId)) {
      toastStore.error(t('mfa.settings.topicIdInvalid'));
      return null;
    }
    if (!topic.label || !isValidLaneCode(topic.laneCode)) {
      toastStore.error(t('mfa.settings.topicsInvalid'));
      return null;
    }
    if (isReservedLaneCode(topic.laneCode)) {
      toastStore.error(t('mfa.settings.topicsLaneReserved'));
      return null;
    }
    if (!normalizedRooms.some((room) => room.roomId === topic.defaultRoomId && room.enabled)) {
      toastStore.error(t('mfa.settings.topicRoomInvalid'));
      return null;
    }

    const timeWindow = validateTopicTimeWindow(topic.availableFrom, topic.availableTo);
    if (!timeWindow.ok) {
      const label = topic.label.trim() || topic.topicId;
      if (timeWindow.code === 'incomplete') {
        toastStore.error(tf('mfa.settings.topicTimeWindowIncompleteForTopic', { label }));
      } else {
        toastStore.error(tf('mfa.settings.topicTimeInvalidForTopic', { label, value: timeWindow.value }));
      }
      return null;
    }
  }

  const result = await patchOpsSettings({ rooms: normalizedRooms, topics: normalizedTopics });
  if (!result.ok) {
    toastStore.error(roomGuardErrorMessage(result.error, options?.roomQueueGuardContext ?? 'remove'));
    return loadTopicsRoomsSettings();
  }

  const nextTopics = sortedTopics(result.data.topics);
  applyMfaPracticeRooms(result.data.rooms);
  applyMfaPracticeTopics(nextTopics);

  if (!options?.silent) {
    toastStore.success(t('mfa.settings.saveSuccess'));
  }

  return {
    rooms: [...result.data.rooms],
    topics: nextTopics,
    journeySettings: structuredClone(result.data.journeySettings),
    routingCapabilities: await loadRoutingCapabilitiesAfterSave(options?.routingCapabilities ?? null),
    savedTopicsSnapshot: JSON.stringify(normalizeTopicsForSave(nextTopics)),
  };
}

async function loadRoutingCapabilitiesAfterSave(
  fallback: RoutingCapabilities | null,
): Promise<RoutingCapabilities> {
  const capabilitiesResult = await fetchRoutingCapabilities();
  if (!capabilitiesResult.ok) {
    toastStore.error(capabilitiesResult.error.message || t('mfa.settings.settingsLoadError'));
    if (fallback) {
      return fallback;
    }
    return {
      routingMode: 'simple',
      openVisitCount: 0,
      features: {
        complexRouting: false,
        journeyDesigner: false,
        routingSimulator: false,
        complexRoutingLicensed: false,
      },
    };
  }
  return capabilitiesResult.data;
}
