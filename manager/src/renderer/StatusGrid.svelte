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
  <section class="status-facts" id="status-facts">
    <h2 id="status-grid-heading">Installation und Laufzeit</h2>
    <div class="lan-ip-status" id="status-grid">
      {#each rows as row (row.label)}
        <div class="lan-ip-status-row">
          <span class="lan-ip-status-label">{row.label}</span>
          <span class="lan-ip-status-value">{row.value}</span>
        </div>
      {/each}
    </div>
  </section>
{/if}
