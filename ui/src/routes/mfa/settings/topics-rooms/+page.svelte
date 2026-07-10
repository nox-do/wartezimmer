<script lang="ts">
  import { onMount } from 'svelte';
  import MfaSettingsPageHeader from '$lib/components/mfa/MfaSettingsPageHeader.svelte';
  import RoomsEditor from '$lib/components/mfa/RoomsEditor.svelte';
  import { loadTopicsRoomsSettings, persistTopicsRoomsSettings } from '$lib/mfa/topics-rooms-settings';
  import type { PracticeRoomWithPanel, PracticeTopicSetting } from '$lib/queue/ops-settings-api';
  import type { RoutingCapabilities } from '$lib/mfa/practice-ops-api';
  import type { RoomQueueGuardContext } from '$lib/queue/room-removal-guard';
  import { t } from '$lib/i18n/i18nStore.svelte';

  let loading = $state(true);
  let saving = $state(false);
  let rooms = $state<PracticeRoomWithPanel[]>([]);
  let topics = $state<PracticeTopicSetting[]>([]);
  let routingCapabilities = $state<RoutingCapabilities | null>(null);

  function handleRoomsChange(nextRooms: PracticeRoomWithPanel[]) {
    // Do not remap topic defaultRoomId here — persist blocks remove/rename while topics still reference the room.
    rooms = nextRooms;
  }

  async function loadSettings() {
    const result = await loadTopicsRoomsSettings();
    loading = false;
    if (!result) {
      return;
    }
    rooms = result.rooms;
    topics = result.topics;
    routingCapabilities = result.routingCapabilities;
  }

  async function persistSettings(options?: {
    silent?: boolean;
    roomQueueGuardContext?: RoomQueueGuardContext;
  }): Promise<boolean> {
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
    return true;
  }

  onMount(() => {
    void loadSettings();
  });
</script>

<MfaSettingsPageHeader
  title={t('mfa.settings.themesRoomsTitle')}
  lead={t('mfa.settings.themesRoomsLead')}
/>

{#if loading}
  <p class="text-muted">{t('ui.loading')}</p>
{:else}
  <RoomsEditor {rooms} busy={saving} onChange={handleRoomsChange} onPersist={persistSettings} />
{/if}
