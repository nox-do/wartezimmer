<script lang="ts">
  import { onMount } from 'svelte';
  import StaffSettingsShell from '$lib/components/shared/StaffSettingsShell.svelte';
  import RoomsEditor from '$lib/components/mfa/RoomsEditor.svelte';
  import TopicsEditor from '$lib/components/mfa/TopicsEditor.svelte';
  import {
    fetchOpsSettings,
    isValidRoomId,
    isValidTopicId,
    listEnabledRooms,
    normalizeRoomsForSave,
    normalizeTopicsForSave,
    patchOpsSettings,
    type PracticeRoomWithPanel,
    type PracticeTopicSetting,
  } from '$lib/queue/ops-settings-api';
  import { setPracticeTopicCatalog } from '$lib/queue/practice-catalog';
  import { roomGuardErrorMessage } from '$lib/queue/room-removal-guard';
  import { isReservedLaneCode, reconcileTopicsWithRooms } from '$lib/queue/topic-settings-form';
  import { validateTopicTimeWindow } from '$lib/queue/time-of-day';
  import { t, tf } from '$lib/i18n/i18nStore.svelte';
  import { toastStore } from '$lib/stores/toastStore';
  let loading = $state(true);
  let saving = $state(false);
  let rooms = $state<PracticeRoomWithPanel[]>([]);
  let topics = $state<PracticeTopicSetting[]>([]);
  let savedTopicsSnapshot = $state('');

  const enabledRooms = $derived(listEnabledRooms(rooms));
  const savedTopicIds = $derived(
    new Set(
      (JSON.parse(savedTopicsSnapshot || '[]') as PracticeTopicSetting[]).map((topic) => topic.topicId),
    ),
  );

  function handleRoomsChange(nextRooms: PracticeRoomWithPanel[]) {
    rooms = nextRooms;
    topics = reconcileTopicsWithRooms(topics, nextRooms);
  }

  async function loadSettings() {
    const result = await fetchOpsSettings();
    loading = false;
    if (!result.ok) {
      toastStore.error(result.error.message || t('mfa.settings.settingsLoadError'));
      return;
    }

    rooms = [...result.data.rooms];
    topics = reconcileTopicsWithRooms(
      [...result.data.topics].sort((a, b) => a.sortOrder - b.sortOrder || a.topicId.localeCompare(b.topicId)),
      result.data.rooms,
    );
    savedTopicsSnapshot = JSON.stringify(normalizeTopicsForSave(topics));
    setPracticeTopicCatalog(topics);
  }

  async function persistSettings(options?: { silent?: boolean }): Promise<boolean> {
    const normalizedRooms = normalizeRoomsForSave(rooms);
    const normalizedTopics = normalizeTopicsForSave(topics);

    if (normalizedRooms.length === 0) {
      toastStore.error(t('mfa.settings.roomsSaveNeedOne'));
      return false;
    }

    const roomIds = new Set<string>();
    for (const room of normalizedRooms) {
      if (!isValidRoomId(room.roomId)) {
        toastStore.error(t('mfa.settings.roomIdInvalid'));
        return false;
      }
      if (roomIds.has(room.roomId)) {
        toastStore.error(t('mfa.settings.roomIdDuplicate'));
        return false;
      }
      roomIds.add(room.roomId);
    }

    if (normalizedTopics.length === 0) {
      toastStore.error(t('mfa.settings.topicsNeedOne'));
      return false;
    }

    for (const topic of normalizedTopics) {
      if (!isValidTopicId(topic.topicId)) {
        toastStore.error(t('mfa.settings.topicIdInvalid'));
        return false;
      }
      if (!topic.label || !/^[A-Z]$/.test(topic.laneCode)) {
        toastStore.error(t('mfa.settings.topicsInvalid'));
        return false;
      }
      if (isReservedLaneCode(topic.laneCode)) {
        toastStore.error(t('mfa.settings.topicsLaneReserved'));
        return false;
      }
      if (!normalizedRooms.some((room) => room.roomId === topic.defaultRoomId && room.enabled)) {
        toastStore.error(t('mfa.settings.topicRoomInvalid'));
        return false;
      }

      const timeWindow = validateTopicTimeWindow(topic.availableFrom, topic.availableTo);
      if (!timeWindow.ok) {
        const label = topic.label.trim() || topic.topicId;
        if (timeWindow.code === 'incomplete') {
          toastStore.error(tf('mfa.settings.topicTimeWindowIncompleteForTopic', { label }));
        } else {
          toastStore.error(tf('mfa.settings.topicTimeInvalidForTopic', { label, value: timeWindow.value }));
        }
        return false;
      }
    }

    saving = true;
    const result = await patchOpsSettings({ rooms: normalizedRooms, topics: normalizedTopics });
    saving = false;

    if (!result.ok) {
      toastStore.error(roomGuardErrorMessage(result.error));
      await loadSettings();
      return false;
    }

    rooms = [...result.data.rooms];
    topics = reconcileTopicsWithRooms(
      [...result.data.topics].sort((a, b) => a.sortOrder - b.sortOrder || a.topicId.localeCompare(b.topicId)),
      result.data.rooms,
    );
    savedTopicsSnapshot = JSON.stringify(normalizeTopicsForSave(topics));
    setPracticeTopicCatalog(topics);
    if (!options?.silent) {
      toastStore.success(t('mfa.settings.saveSuccess'));
    }
    return true;
  }

  onMount(() => {
    void loadSettings();
  });
</script>

<StaffSettingsShell surface="mfa" title={t('mfa.settings.themesRoomsTitle')} lead={t('mfa.settings.themesRoomsLead')}>
  {#if loading}
    <p class="text-muted">{t('ui.loading')}</p>
  {:else}
    <RoomsEditor
      {rooms}
      {topics}
      busy={saving}
      onChange={handleRoomsChange}
      onPersist={persistSettings}
    />

    <TopicsEditor
      {topics}
      {enabledRooms}
      {savedTopicIds}
      busy={saving}
      onChange={(next) => {
        topics = next;
      }}
      onPersist={persistSettings}
    />
  {/if}
</StaffSettingsShell>
