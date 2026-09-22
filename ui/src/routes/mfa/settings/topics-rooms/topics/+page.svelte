<script lang="ts">
  import { onMount } from 'svelte';
  import StaffSettingsShell from '$lib/components/shared/StaffSettingsShell.svelte';
  import TopicsEditor from '$lib/components/mfa/TopicsEditor.svelte';
  import { loadTopicsRoomsSettings, persistTopicsRoomsSettings } from '$lib/mfa/topics-rooms-settings';
  import { listEnabledRooms } from '$lib/queue/ops-settings-api';
  import type { JourneySettings } from '$lib/ops/openapi-types';
  import type { PracticeRoomWithPanels, PracticeTopicSetting } from '$lib/queue/ops-settings-api';
  import type { RoutingCapabilities } from '$lib/mfa/practice-ops-api';
  import { t } from '$lib/i18n/i18nStore.svelte';

  let loading = $state(true);
  let saving = $state(false);
  let rooms = $state<PracticeRoomWithPanels[]>([]);
  let topics = $state<PracticeTopicSetting[]>([]);
  let journeySettings = $state<JourneySettings>({ templates: [] });
  let routingCapabilities = $state<RoutingCapabilities | null>(null);
  let savedTopicsSnapshot = $state('');
  let settingsUpdatedAt = $state('');

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
    journeySettings = result.journeySettings;
    routingCapabilities = result.routingCapabilities;
    savedTopicsSnapshot = result.savedTopicsSnapshot;
    settingsUpdatedAt = result.updatedAt;
  }

  async function persistSettings(options?: { silent?: boolean }): Promise<boolean> {
    saving = true;
    const result = await persistTopicsRoomsSettings(rooms, topics, {
      ...options,
      section: 'topics',
      expectedUpdatedAt: settingsUpdatedAt,
      routingCapabilities,
    });
    saving = false;
    if (!result) {
      await loadSettings();
      return false;
    }
    rooms = result.rooms;
    topics = result.topics;
    journeySettings = result.journeySettings;
    routingCapabilities = result.routingCapabilities;
    savedTopicsSnapshot = result.savedTopicsSnapshot;
    settingsUpdatedAt = result.updatedAt;
    return true;
  }

  onMount(() => {
    void loadSettings();
  });
</script>

<StaffSettingsShell title={t('mfa.settings.topicsPanelTitle')}>
  {#if loading}
    <p class="text-muted">{t('ui.loading')}</p>
  {:else}
    <TopicsEditor
      {topics}
      {enabledRooms}
      {savedTopicIds}
      journeyTemplates={journeySettings.templates}
      {routingCapabilities}
      busy={saving}
      onChange={(next) => {
        topics = next;
      }}
      onPersist={persistSettings}
    />
  {/if}
</StaffSettingsShell>
