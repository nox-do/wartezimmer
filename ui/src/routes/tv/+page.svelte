<script lang="ts">
  import { onMount } from 'svelte';
  import DevicePairingPrompt from '$lib/components/auth/DevicePairingPrompt.svelte';
  import {
    getPracticeProfileFallback,
    mountPracticeProfileSync,
    practiceDisplayLabel,
  } from '$lib/practice/practice-profile-client';
  import { mountTvDisplay, tvDisplay } from '$lib/tv/tv-display.svelte';
  import {
    mountTvWaitingLayout,
    tvWaitingLayout,
    getVisibleWaiting,
    getWaitingPageCount,
    getWaitingPaginated,
  } from '$lib/tv/tv-waiting-layout.svelte';
  import { t, tf } from '$lib/i18n/i18nStore.svelte';

  let practiceProfile = $state(getPracticeProfileFallback());
  const practiceName = $derived(practiceDisplayLabel(practiceProfile, t('terminal.practiceFallback')));
  const visibleWaiting = $derived(getVisibleWaiting());
  const waitingPageCount = $derived(getWaitingPageCount());
  const waitingPaginated = $derived(getWaitingPaginated());

  let waitingPanelEl = $state<HTMLElement | null>(null);
  let waitingViewportEl = $state<HTMLDivElement | null>(null);

  onMount(() => {
    const stopProfile = mountPracticeProfileSync((profile) => {
      practiceProfile = profile;
    });

    const stopDisplay = mountTvDisplay();
    const stopWaitingLayout = mountTvWaitingLayout({
      getPanelEl: () => waitingPanelEl,
      getViewportEl: () => waitingViewportEl,
    });

    return () => {
      stopProfile();
      stopWaitingLayout();
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
      <section class="tv-panel tv-panel--waiting" bind:this={waitingPanelEl} aria-labelledby="wait-title">
        <h2 class="tv-panel-title" id="wait-title">{t('tv.zoneWaiting')}</h2>
        {#if tvDisplay.waiting.length === 0}
          <p class="tv-panel-empty">{t('tv.waitingEmpty')}</p>
        {:else}
          <div class="tv-waiting-viewport" bind:this={waitingViewportEl}>
            <ul
              class="tv-num-list tv-num-list--waiting"
              class:tv-num-list--cols-2={tvWaitingLayout.layout.columns === 2}
            >
              {#each visibleWaiting as row (row.ticketCode)}
                <li class="tv-num-item" class:tv-num-item--away={row.away}>
                  <span class="tv-ticket">{row.ticketCode}</span>
                  {#if row.hint}
                    <span class="tv-wait-hint">{row.hint}</span>
                  {/if}
                </li>
              {/each}
            </ul>
          </div>
          {#if waitingPaginated}
            <p class="tv-waiting-pages" aria-live="polite">
              {tf('tv.pageIndicator', {
                current: tvWaitingLayout.pageIndex + 1,
                total: waitingPageCount,
              })}
            </p>
          {/if}
        {/if}
      </section>

      <section class="tv-panel tv-panel--calls" aria-labelledby="call-title">
        <h2 class="tv-panel-title" id="call-title">{t('tv.zoneCalls')}</h2>
        {#if tvDisplay.calls.length === 0}
          <p class="tv-panel-empty">{t('tv.callsEmpty')}</p>
        {:else}
          <ul class="tv-num-list tv-num-list--calls">
            {#each tvDisplay.calls as row (row.ticketCode)}
              <li class="tv-num-item">
                <span class="tv-ticket">{row.ticketCode}</span>
                <span class="tv-call-where">{row.where}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    </div>
  {/if}
</div>
