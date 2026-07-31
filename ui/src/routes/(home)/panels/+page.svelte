<script lang="ts">
  import { onMount } from 'svelte';
  import StaffSettingsShell from '$lib/components/shared/StaffSettingsShell.svelte';
  import HomeLinkCards from '$lib/components/home/HomeLinkCards.svelte';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import { fetchRoomPanelRooms, type RoomPanelRoom } from '$lib/room-panel/room-panel-api';
  import { buildRoomPanelPath } from '$lib/room-panel/room-panel-requested-url';

  let panelRooms = $state<RoomPanelRoom[]>([]);
  let panelRoomsLoading = $state(false);
  let panelRoomsError = $state<string | null>(null);

  const cards = $derived(
    panelRooms.map((room) => ({
      id: `${room.roomId}:${room.placement}`,
      href: buildRoomPanelPath(room.roomId, room.placement),
      title: room.roomLabel,
      subtitle: t(`mfa.settings.roomPanelPlacementShort_${room.placement}`),
    })),
  );

  onMount(() => {
    void loadPanelRooms();
  });

  async function loadPanelRooms() {
    panelRoomsLoading = true;
    panelRoomsError = null;
    const result = await fetchRoomPanelRooms();
    panelRoomsLoading = false;
    if (!result.ok) {
      panelRoomsError = result.error.message;
      return;
    }
    panelRooms = result.data.rooms;
  }
</script>

<StaffSettingsShell title={t('home.navRooms')} lead={t('home.roomsLead')}>
  <p class="home-rooms-hint text-muted">{t('home.roomsChromeHint')}</p>

  {#if panelRoomsLoading}
    <p class="text-muted">{t('ui.loading')}</p>
  {:else if panelRoomsError}
    <p class="home-rooms-error">{panelRoomsError ?? t('home.roomsError')}</p>
  {:else if panelRooms.length === 0}
    <p class="text-muted">{t('home.roomsEmpty')}</p>
  {:else}
    <HomeLinkCards items={cards} ariaLabel={t('home.navRooms')} />
  {/if}
</StaffSettingsShell>

<style>
  .home-rooms-hint {
    margin: 0 0 1rem;
    max-width: 40rem;
    font-size: 0.875rem;
    line-height: 1.45;
  }

  .home-rooms-error {
    color: var(--destructive);
    font-weight: 700;
  }
</style>
