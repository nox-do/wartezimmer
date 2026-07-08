<script lang="ts">
  import { onMount } from 'svelte';
  import DevicePairingPrompt from '$lib/components/auth/DevicePairingPrompt.svelte';
  import TvPaginatedPanel from '$lib/components/tv/TvPaginatedPanel.svelte';
  import {
    getPracticeProfileFallback,
    mountPracticeProfileSync,
    practiceDisplayLabel,
  } from '$lib/practice/practice-profile-client';
  import { mountTvDisplay, tvDisplay } from '$lib/tv/tv-display.svelte';
  import { t, tf } from '$lib/i18n/i18nStore.svelte';

  let practiceProfile = $state(getPracticeProfileFallback());
  const practiceName = $derived(practiceDisplayLabel(practiceProfile, t('terminal.practiceFallback')));

  onMount(() => {
    const stopProfile = mountPracticeProfileSync((profile) => {
      practiceProfile = profile;
    });
    const stopDisplay = mountTvDisplay();

    return () => {
      stopProfile();
      stopDisplay();
    };
  });
</script>

<div class="tv-board">
  {#if !tvDisplay.pairingCode}
    <p class="tv-praxis">{practiceName}</p>
  {/if}

  {#if tvDisplay.pairingCode}
    <DevicePairingPrompt
      titleKey="tv.pairingTitle"
      hintKey="tv.pairingHint"
      codeLabelKey="tv.pairingCodeLabel"
      code={tvDisplay.pairingCode}
      expiresText={tvDisplay.pairingExpiresAt
        ? tf('tv.pairingExpires', { time: new Date(tvDisplay.pairingExpiresAt).toLocaleTimeString() })
        : null}
    />
  {:else if tvDisplay.loading}
    <p class="tv-status-bar">{t('tv.connecting')}</p>
  {:else if tvDisplay.errorMessage}
    <p class="tv-status-bar">{tvDisplay.errorMessage}</p>
  {:else}
    <div class="tv-grid">
      <TvPaginatedPanel
        items={tvDisplay.waiting}
        title={t('tv.zoneWaiting')}
        titleId="wait-title"
        emptyText={t('tv.waitingEmpty')}
        panelClass="tv-panel--waiting"
        listClass="tv-num-list tv-num-list--waiting"
        paused={tvDisplay.loading}
        allowTwoColumns
      >
        {#snippet row(row)}
          <li class="tv-num-item" class:tv-num-item--away={row.away}>
            <span class="tv-ticket">{row.ticketCode}</span>
            {#if row.hint}
              <span class="tv-wait-hint">{row.hint}</span>
            {/if}
          </li>
        {/snippet}
      </TvPaginatedPanel>

      <TvPaginatedPanel
        items={tvDisplay.calls}
        title={t('tv.zoneCalls')}
        titleId="call-title"
        emptyText={t('tv.callsEmpty')}
        panelClass="tv-panel--calls"
        listClass="tv-num-list tv-num-list--calls"
        paused={tvDisplay.loading}
        shrinkOnOverflow
      >
        {#snippet row(row)}
          <li class="tv-num-item">
            <span class="tv-ticket">{row.ticketCode}</span>
            <span class="tv-call-where">{row.where}</span>
          </li>
        {/snippet}
      </TvPaginatedPanel>
    </div>
  {/if}
</div>
