<script lang="ts">
  import {
    softwareUpdateInfoRows,
    softwareUpdateSectionVisible,
  } from './maintenance-view-model.js';
  import type { HostStatus } from '../shared/host-status.js';

  let {
    status,
    statusText = '',
    busy = false,
    onImport,
  }: {
    status: HostStatus | null;
    statusText?: string;
    busy?: boolean;
    onImport: () => void;
  } = $props();

  const visible = $derived(softwareUpdateSectionVisible(status));
  const rows = $derived(status ? softwareUpdateInfoRows(status) : []);
</script>

{#if visible && status}
  <div class="panel-section">
    <h2>Software-Update</h2>
    <p class="hint">
      Release-Paket aus Ihrer Praxis-Flow-Freigabe importieren. Im selben Ordner wie die
      <code>.tar.gz</code> müssen <code>manifest.json</code> oder <code>SHA256SUMS.txt</code> liegen
      — die Prüfsumme wird vor dem Import verifiziert.
    </p>
    <dl class="status-grid maintenance-software-info">
      {#each rows as row (row.label)}
        <dt>{row.label}</dt>
        <dd>{row.value}</dd>
      {/each}
    </dl>
    <div class="actions-row">
      <button type="button" class="btn-secondary" disabled={busy} onclick={onImport}>
        Release-Paket importieren …
      </button>
    </div>
    {#if statusText}
      <p class="maintenance-backup-status">{statusText}</p>
    {/if}
  </div>
{/if}
