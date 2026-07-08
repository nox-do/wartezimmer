<script lang="ts" generics="T extends { ticketCode: string }">
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  import { mountTvPanelLayout } from '$lib/tv/tv-panel-layout.svelte';
  import type { WaitingListLayout } from '$lib/tv/waiting-list-layout';
  import { tf } from '$lib/i18n/i18nStore.svelte';

  type Props = {
    items: T[];
    title: string;
    titleId: string;
    emptyText: string;
    panelClass?: string;
    listClass: string;
    paused?: boolean;
    allowTwoColumns?: boolean;
    shrinkOnOverflow?: boolean;
    row: Snippet<[T]>;
  };

  let {
    items,
    title,
    titleId,
    emptyText,
    panelClass = '',
    listClass,
    paused = false,
    allowTwoColumns = false,
    shrinkOnOverflow = false,
    row,
  }: Props = $props();

  let panelEl = $state<HTMLElement | null>(null);
  let viewportEl = $state<HTMLDivElement | null>(null);

  const panelLayout = $state({
    layout: { columns: 1, pages: [[]] } as WaitingListLayout<T>,
    pageIndex: 0,
  });

  const visibleItems = $derived(panelLayout.layout.pages[panelLayout.pageIndex] ?? []);
  const pageCount = $derived(panelLayout.layout.pages.length);
  const paginated = $derived(pageCount > 1);

  onMount(() =>
    mountTvPanelLayout(panelLayout, {
      getItems: () => items,
      getPanelEl: () => panelEl,
      getViewportEl: () => viewportEl,
      getPaused: () => paused,
      allowTwoColumns,
      shrinkOnOverflow,
    }),
  );
</script>

<section class="tv-panel {panelClass}" bind:this={panelEl} aria-labelledby={titleId}>
  <h2 class="tv-panel-title" id={titleId}>{title}</h2>
  {#if items.length === 0}
    <p class="tv-panel-empty">{emptyText}</p>
  {:else}
    <div class="tv-panel-viewport" bind:this={viewportEl}>
      <ul
        class={listClass}
        class:tv-num-list--cols-2={panelLayout.layout.columns === 2}
        data-tv-list
      >
        {#each visibleItems as item (item.ticketCode)}
          {@render row(item)}
        {/each}
      </ul>
    </div>
    {#if paginated}
      <p class="tv-panel-pages" aria-live="polite">
        {tf('tv.pageIndicator', {
          current: panelLayout.pageIndex + 1,
          total: pageCount,
        })}
      </p>
    {/if}
  {/if}
</section>
