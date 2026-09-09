import {
  fetchOpsSettingsDeduped,
  type PracticeRoom,
  type PracticeTopicSetting,
} from '$lib/queue/ops-settings-api';
import { setPracticeTopicCatalog } from '$lib/queue/practice-catalog';
import { t } from '$lib/i18n/i18nStore.svelte';
import { toastStore } from '$lib/stores/toastStore';
import type { CallRoomTargetOptions } from '$lib/queue/call-room-target';

const CALL_ROOM_OVERRIDE_STORAGE_KEY = 'mfa:call-room-override-id';

export const mfaPracticeContext = $state({
  practiceRooms: [] as PracticeRoom[],
  practiceTopics: [] as PracticeTopicSetting[],
  routingMode: 'simple' as 'simple' | 'complex',
  postWaitingCallTargetId: null as string | null,
  callRoomOverrideId: null as string | null,
  returnWindowMinutes: 15,
});

/** Single write path for MFA topic catalog + practice context topics. */
export function applyMfaPracticeTopics(topics: PracticeTopicSetting[]) {
  mfaPracticeContext.practiceTopics = [...topics];
  setPracticeTopicCatalog(topics);
}

export function applyMfaPracticeRooms(rooms: PracticeRoom[]) {
  mfaPracticeContext.practiceRooms = [...rooms];
  if (
    mfaPracticeContext.callRoomOverrideId &&
    !rooms.some((room) => room.enabled && room.roomId === mfaPracticeContext.callRoomOverrideId)
  ) {
    setMfaCallRoomOverride(null);
  }
}

export function setMfaCallRoomOverride(roomId: string | null) {
  mfaPracticeContext.callRoomOverrideId = roomId;
  if (typeof sessionStorage === 'undefined') return;
  if (roomId) {
    sessionStorage.setItem(CALL_ROOM_OVERRIDE_STORAGE_KEY, roomId);
  } else {
    sessionStorage.removeItem(CALL_ROOM_OVERRIDE_STORAGE_KEY);
  }
}

export function mfaCallRoomTargetOptions(): CallRoomTargetOptions {
  return {
    rooms: mfaPracticeContext.practiceRooms,
    routingMode: mfaPracticeContext.routingMode,
    postWaitingCallTargetId: mfaPracticeContext.postWaitingCallTargetId,
    callRoomOverrideId: mfaPracticeContext.callRoomOverrideId,
  };
}

export function resetMfaPracticeContext() {
  mfaPracticeContext.practiceRooms = [];
  mfaPracticeContext.practiceTopics = [];
  mfaPracticeContext.routingMode = 'simple';
  mfaPracticeContext.postWaitingCallTargetId = null;
  mfaPracticeContext.callRoomOverrideId = null;
  mfaPracticeContext.returnWindowMinutes = 15;
  setPracticeTopicCatalog([]);
}

export async function loadMfaPracticeContext() {
  const settingsResult = await fetchOpsSettingsDeduped();
  if (!settingsResult.ok) {
    toastStore.error(settingsResult.error.message || t('mfa.queueLoadError'));
    return;
  }

  applyMfaPracticeRooms(settingsResult.data.rooms ?? []);
  applyMfaPracticeTopics(settingsResult.data.topics ?? []);
  mfaPracticeContext.routingMode = settingsResult.data.routingMode ?? 'simple';
  mfaPracticeContext.postWaitingCallTargetId = settingsResult.data.postWaitingCallTargetId;
  const storedOverride =
    typeof sessionStorage === 'undefined'
      ? null
      : sessionStorage.getItem(CALL_ROOM_OVERRIDE_STORAGE_KEY);
  setMfaCallRoomOverride(
    mfaPracticeContext.routingMode === 'simple' &&
      mfaPracticeContext.practiceRooms.some(
        (room) => room.enabled && room.roomId === storedOverride,
      )
      ? storedOverride
      : null,
  );
  mfaPracticeContext.returnWindowMinutes = settingsResult.data.returnWindowMinutes ?? 15;
}
