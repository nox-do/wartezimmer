import {
  fetchOpsSettingsDeduped,
  listEnabledRooms,
  type PracticeRoom,
  type PracticeTopicSetting,
} from '$lib/queue/ops-settings-api';
import {
  clearStoredCallRoomOverride,
  readStoredCallRoomOverrideId,
  storeCallRoomOverrideId,
} from '$lib/queue/mfa-call-room-override-storage';
import { setPracticeTopicCatalog } from '$lib/queue/practice-catalog';
import { toRoomTarget } from '$lib/queue/room-target';
import { t } from '$lib/i18n/i18nStore.svelte';
import { toastStore } from '$lib/stores/toastStore';

export const mfaPracticeContext = $state({
  practiceRooms: [] as PracticeRoom[],
  practiceTopics: [] as PracticeTopicSetting[],
  /** Active Quicksettings override; null = aus (Ticket-Ziel gilt). */
  callRoomOverrideId: null as string | null,
  returnWindowMinutes: 15,
});

export function resetMfaPracticeContext() {
  mfaPracticeContext.practiceRooms = [];
  mfaPracticeContext.practiceTopics = [];
  mfaPracticeContext.callRoomOverrideId = null;
  mfaPracticeContext.returnWindowMinutes = 15;
  setPracticeTopicCatalog([]);
}

function reconcileCallRoomOverrideId(): string | null {
  const resolved = readStoredCallRoomOverrideId(mfaPracticeContext.practiceRooms);
  if (resolved !== mfaPracticeContext.callRoomOverrideId) {
    mfaPracticeContext.callRoomOverrideId = resolved;
  }
  return resolved;
}

/** Session override from Quicksettings; undefined when all room toggles are off. */
export function getMfaCallRoomOverride() {
  const resolvedId = reconcileCallRoomOverrideId();
  if (!resolvedId) {
    return undefined;
  }
  return toRoomTarget(
    listEnabledRooms(mfaPracticeContext.practiceRooms).find((room) => room.roomId === resolvedId),
  );
}

export async function loadMfaPracticeContext() {
  const settingsResult = await fetchOpsSettingsDeduped();
  if (!settingsResult.ok) {
    toastStore.error(settingsResult.error.message || t('mfa.queueLoadError'));
    return;
  }

  mfaPracticeContext.practiceRooms = settingsResult.data.rooms ?? [];
  mfaPracticeContext.practiceTopics = settingsResult.data.topics ?? [];
  mfaPracticeContext.returnWindowMinutes = settingsResult.data.returnWindowMinutes ?? 15;
  setPracticeTopicCatalog(mfaPracticeContext.practiceTopics);
  mfaPracticeContext.callRoomOverrideId = readStoredCallRoomOverrideId(
    mfaPracticeContext.practiceRooms,
  );
}

export function toggleMfaCallRoomOverride(roomId: string) {
  if (mfaPracticeContext.callRoomOverrideId === roomId) {
    mfaPracticeContext.callRoomOverrideId = null;
    clearStoredCallRoomOverride();
    return;
  }
  mfaPracticeContext.callRoomOverrideId = roomId;
  storeCallRoomOverrideId(roomId);
}
