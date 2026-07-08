<script lang="ts">
  import type { HostStatus } from '../shared/host-status.js';
  import { statusGridRows } from './status-view-model.js';

  let {
    status,
    setupEntry,
  }: {
    status: HostStatus;
    setupEntry: boolean;
  } = $props();

  const rows = $derived(statusGridRows(status));
</script>

{#if !setupEntry}
  <h2 id="status-grid-heading" class="status-grid-heading" hidden>Diagnose</h2>
  <dl class="status-grid" id="status-grid">
    {#each rows as row (row.label)}
      <dt>{row.label}</dt>
      <dd>{row.value}</dd>
    {/each}
  </dl>
{/if}
