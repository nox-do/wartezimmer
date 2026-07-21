<script lang="ts">
  import {
    collectHealthTiles,
    deriveOverallStatus,
    type HealthTileChip,
    type HealthTileSpec,
  } from './health-header.js';
  import { managerShell } from './manager-shell-state.svelte.js';

  const overall = $derived(
    managerShell.runtimeError
      ? ({ text: 'Unbekannt', level: 'bad' } as const)
      : managerShell.runtimeSnapshot
        ? deriveOverallStatus(managerShell.runtimeSnapshot)
        : ({ text: '…', level: 'ok' } as const),
  );

  const tiles = $derived(
    managerShell.runtimeError || !managerShell.runtimeSnapshot
      ? []
      : collectHealthTiles(managerShell.runtimeSnapshot),
  );

  const errorMessage = $derived(
    managerShell.runtimeError || 'Setup-API nicht erreichbar — bitte Manager neu starten.',
  );

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
  <p id="health-banner" class={`health-banner is-${overall.level}`} aria-live="polite">
    {overall.text}
  </p>
  <div id="health-tiles" class="health-tiles">
    {#if managerShell.runtimeError}
      <article class="health-tile health-tile-error">{errorMessage}</article>
    {:else}
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
    {/if}
  </div>
</header>
