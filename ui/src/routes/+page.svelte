<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '$lib/components/forms/Button.svelte';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import { fetchRoomPanelRooms, type RoomPanelRoom } from '$lib/room-panel/room-panel-api';

  let panelRooms = $state<RoomPanelRoom[]>([]);
  let panelRoomsLoading = $state(false);
  let panelRoomsError = $state<string | null>(null);

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

  function roomPanelHref(roomId: string): string {
    return `/room-panel?room=${encodeURIComponent(roomId)}`;
  }

  const newTabLink = {
    target: '_blank',
    rel: 'noopener noreferrer',
  } as const;
</script>

<section class="card scaffold-home">
  <header class="hero">
    <p class="hero-eyebrow">Praxis Flow</p>
    <h1 class="page-title">{t('nav.home')}</h1>
    <p class="page-lead">
      Zentrale Startseite für Ihren Praxisbetrieb: Team, Patientenfluss und Raumsteuerung auf einen Blick.
    </p>
  </header>

  <section class="quick-actions" aria-labelledby="quick-actions-title">
    <h2 id="quick-actions-title">Schnellzugriffe</h2>
    <p>Direkter Einstieg in die wichtigsten Bereiche für Empfangsteam, MFA und Wartezimmer-Anzeige.</p>
    <nav class="home-nav" aria-label={t('ui.mainNavAria')}>
      <Button href="/mfa" variant="primary" {...newTabLink}>{t('nav.mfa')}</Button>
      <Button href="/terminal" variant="secondary" {...newTabLink}>{t('nav.terminal')}</Button>
      <Button href="/tv" variant="secondary" {...newTabLink}>{t('nav.tv')}</Button>
      <Button href="/portal" variant="secondary" {...newTabLink}>{t('nav.portal')}</Button>
      <Button href="/ops" variant="secondary" {...newTabLink}>{t('nav.ops')}</Button>
    </nav>
  </section>

  <section class="panel-links" aria-labelledby="room-panel-links-title">
    <div>
      <h2 id="room-panel-links-title">Raum-Panels</h2>
      <p>Aktivierte Raumansichten können direkt am jeweiligen Raumgerät geöffnet werden.</p>
    </div>

    {#if panelRoomsLoading}
      <p class="text-muted">{t('ui.loading')}</p>
    {:else if panelRoomsError}
      <p class="panel-links__error">{panelRoomsError}</p>
    {:else if panelRooms.length === 0}
      <p class="text-muted">Noch keine Raum-Panels aktiviert.</p>
    {:else}
      <div class="panel-links__list">
        {#each panelRooms as room (room.roomId)}
          <Button href={roomPanelHref(room.roomId)} variant="outline" {...newTabLink}>{room.roomLabel}</Button>
        {/each}
      </div>
    {/if}
  </section>
</section>

<style>
  .scaffold-home {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .hero {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .hero-eyebrow {
    margin: 0;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted-foreground);
  }

  .quick-actions {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem;
    border: 1px solid var(--border);
    border-radius: 0.875rem;
    background: color-mix(in oklab, var(--card) 88%, var(--background));
  }

  .quick-actions h2 {
    margin: 0;
    font-size: 1rem;
  }

  .quick-actions p {
    margin: 0;
    color: var(--muted-foreground);
  }

  .home-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .panel-links {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: 1.5rem;
    padding-top: 1.25rem;
    border-top: 1px solid var(--border);
  }

  .panel-links h2 {
    margin: 0;
    font-size: 1rem;
  }

  .panel-links p {
    margin: 0.25rem 0 0;
    color: var(--muted-foreground);
  }

  .panel-links__list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .panel-links__error {
    color: var(--destructive);
    font-weight: 700;
  }
</style>
