<script lang="ts">
  import { Search } from '@lucide/svelte';
  import TopicLaneBadge from '$lib/components/topics/TopicLaneBadge.svelte';
  import { t, tf } from '$lib/i18n/i18nStore.svelte';
  import { getTopicAccentColor } from '$lib/queue/practice-catalog';
  import { uniqueWaitingLanes } from '$lib/queue/waiting-list-filter';
  import type { QueueItem } from '$lib/queue/types';

  interface Props {
    items: QueueItem[];
    searchQuery?: string;
    laneCode?: string | null;
    /** Show search even when the queue is empty (quicksettings). */
    alwaysShow?: boolean;
    /** Narrow sidebar layout + shorter placeholder. */
    compact?: boolean;
  }

  let {
    items,
    searchQuery = $bindable(''),
    laneCode = $bindable<string | null>(null),
    alwaysShow = false,
    compact = false,
  }: Props = $props();

  const lanes = $derived(uniqueWaitingLanes(items));
  const visible = $derived(alwaysShow || items.length > 0);

  function accentForLane(lane: string): string {
    const sample = items.find((item) => item.laneCode.trim().toUpperCase() === lane);
    return getTopicAccentColor(sample?.topicId ?? '', lane);
  }

  function handleSearchInput(event: Event) {
    const value = (event.currentTarget as HTMLInputElement).value;
    searchQuery = value;
    if (value.trim()) {
      laneCode = null;
    }
  }

  function toggleLane(lane: string) {
    if (laneCode === lane) {
      laneCode = null;
      return;
    }
    searchQuery = '';
    laneCode = lane;
  }
</script>

{#if visible}
  <div class="waiting-list-filters" class:waiting-list-filters--compact={compact}>
    <label class="waiting-list-search">
      <span class="sr-only">{t('mfa.waitingSearchAria')}</span>
      <Search class="waiting-list-search__icon" size={16} aria-hidden="true" />
      <input
        class="waiting-list-search__input"
        type="search"
        autocomplete="off"
        spellcheck="false"
        placeholder={compact ? t('mfa.waitingSearchPlaceholderShort') : t('mfa.waitingSearchPlaceholder')}
        value={searchQuery}
        oninput={handleSearchInput}
      />
    </label>

    {#if lanes.length > 0}
      <div class="waiting-list-lanes" role="group" aria-label={t('mfa.waitingLaneFilterAria')}>
        {#each lanes as lane (lane)}
          <button
            type="button"
            class="waiting-list-lane"
            class:waiting-list-lane--active={laneCode === lane}
            aria-pressed={laneCode === lane}
            aria-label={tf('mfa.waitingLaneFilterButtonAria', { lane })}
            title={lane}
            onclick={() => toggleLane(lane)}
          >
            <TopicLaneBadge laneCode={lane} accentColor={accentForLane(lane)} title={lane} />
          </button>
        {/each}
      </div>
    {/if}
  </div>
{/if}
