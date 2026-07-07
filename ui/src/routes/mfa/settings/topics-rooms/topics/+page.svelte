<script lang="ts">
  import { onMount } from 'svelte';
  import MfaSettingsPageHeader from '$lib/components/mfa/MfaSettingsPageHeader.svelte';
  import TopicsEditor from '$lib/components/mfa/TopicsEditor.svelte';
  import { loadTopicsRoomsSettings, persistTopicsRoomsSettings } from '$lib/mfa/topics-rooms-settings';
  import { listEnabledRooms } from '$lib/queue/ops-settings-api';
  import type { PracticeRoomWithPanel, PracticeTopicSetting } from '$lib/queue/ops-settings-api';
  import type { RoutingCapabilities } from '$lib/mfa/practice-ops-api';
  import { t } from '$lib/i18n/i18nStore.svelte';

  let loading = $state(true);
  let saving = $state(false);
  let rooms = $state<PracticeRoomWithPanel[]>([]);
  let topics = $state<PracticeTopicSetting[]>([]);
  let routingCapabilities = $state<RoutingCapabilities | null>(null);
  let savedTopicsSnapshot = $state('');

  const enabledRooms = $derived(listEnabledRooms(rooms));
  const savedTopicIds = $derived(
    new Set(
      (JSON.parse(savedTopicsSnapshot || '[]') as PracticeTopicSetting[]).map((topic) => topic.topicId),
    ),
  );

  async function loadSettings() {
    const result = await loadTopicsRoomsSettings();
    loading = false;
    if (!result) {
      return;
    }
    rooms = result.rooms;
    topics = result.topics;
    routingCapabilities = result.routingCapabilities;
    savedTopicsSnapshot = result.savedTopicsSnapshot;
  }

  async function persistSettings(options?: { silent?: boolean }): Promise<boolean> {
    saving = true;
    const result = await persistTopicsRoomsSettings(rooms, topics, {
      ...options,
      routingCapabilities,
    });
    saving = false;
    if (!result) {
      await loadSettings();
      return false;
    }
    rooms = result.rooms;
    topics = result.topics;
    routingCapabilities = result.routingCapabilities;
    savedTopicsSnapshot = result.savedTopicsSnapshot;
    return true;
  }

  onMount(() => {
    void loadSettings();
  });
</script>

<MfaSettingsPageHeader title={t('mfa.settings.topicsPanelTitle')} lead={t('mfa.settings.topicsPanelDesc')} />

{#if loading}
  <p class="text-muted">{t('ui.loading')}</p>
{:else}
  <TopicsEditor
    {topics}
    {enabledRooms}
    {savedTopicIds}
    {routingCapabilities}
    busy={saving}
    onChange={(next) => {
      topics = next;
    }}
    onPersist={persistSettings}
  />
{/if}
