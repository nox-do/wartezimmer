<script lang="ts">
  import {
    collectObservedHealthTiles,
    type HealthTileChip,
    type HealthTileSpec,
  } from './health-header.js';
  import { runtimeObservationNotice } from './runtime-observation.js';
  import { managerShell } from './manager-shell-state.svelte.js';
  import { managerStatusViewModel } from './manager-status-view-model.js';

  const overall = $derived(managerStatusViewModel(managerShell.configSnapshot, managerShell.runtimeObservation));
  const tiles = $derived(collectObservedHealthTiles(managerShell.runtimeObservation));
  const errorMessage = $derived(runtimeObservationNotice(managerShell.runtimeObservation));

  function chipClass(chip: HealthTileChip): string {
    if (chip.neutral) {
      return 'reachability-chip is-neutral';
    }
    if (chip.ok === null) {
      return 'reachability-chip is-pending';
    }
    if (chip.warn) {
      return 'reachability-chip is-warn';
    }
    return `reachability-chip ${chip.ok ? 'is-ok' : 'is-bad'}`;
  }

  function chipLabel(chip: HealthTileChip): string {
    return chip.ok === null ? `${chip.label} …` : chip.label;
  }

  function dotClass(tile: HealthTileSpec): string {
    return tile.status === null ? 'probe-dot' : `probe-dot ${tile.status}`;
  }
</script>

<header id="health-header" class="health-header">
  <p class={overall.noticeClass} role="status">{overall.primary.summary}</p>
  <div id="health-tiles" class="health-tiles">
    {#if errorMessage}
      <article class="health-tile health-tile-error">{errorMessage}</article>
    {/if}
    {#each tiles as tile (tile.name)}
      <article class="health-tile">
        <div class="health-tile-head">
          <span class={dotClass(tile)} aria-hidden="true"></span>
          <span class="health-tile-name">{tile.name}</span>
        </div>
        <p class="health-tile-detail" class:is-warn={tile.status === 'warn'}>{tile.detail}</p>
        {#if tile.chips && tile.chips.length > 0}
          <div class="health-tile-chips">
            {#each tile.chips as chip (chip.label)}
              <span class={chipClass(chip)}>{chipLabel(chip)}</span>
            {/each}
          </div>
        {/if}
      </article>
    {/each}
  </div>
</header>
