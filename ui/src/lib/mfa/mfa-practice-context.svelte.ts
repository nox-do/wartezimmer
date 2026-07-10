import {
  fetchOpsSettingsDeduped,
  type PracticeRoom,
  type PracticeTopicSetting,
} from '$lib/queue/ops-settings-api';
import { setPracticeTopicCatalog } from '$lib/queue/practice-catalog';
import { t } from '$lib/i18n/i18nStore.svelte';
import { toastStore } from '$lib/stores/toastStore';

export const mfaPracticeContext = $state({
  practiceRooms: [] as PracticeRoom[],
  practiceTopics: [] as PracticeTopicSetting[],
  returnWindowMinutes: 15,
});

/** Single write path for MFA topic catalog + practice context topics. */
export function applyMfaPracticeTopics(topics: PracticeTopicSetting[]) {
  mfaPracticeContext.practiceTopics = [...topics];
  setPracticeTopicCatalog(topics);
}

export function applyMfaPracticeRooms(rooms: PracticeRoom[]) {
  mfaPracticeContext.practiceRooms = [...rooms];
}

export function resetMfaPracticeContext() {
  mfaPracticeContext.practiceRooms = [];
  mfaPracticeContext.practiceTopics = [];
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
  mfaPracticeContext.returnWindowMinutes = settingsResult.data.returnWindowMinutes ?? 15;
}
