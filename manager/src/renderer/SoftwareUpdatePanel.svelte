<script lang="ts">
  import {
    softwareUpdateInfoRows,
    softwareUpdateSectionVisible,
  } from './maintenance-view-model.js';
  import type { HostStatus } from '../shared/host-status.js';

  let {
    status,
    statusText = '',
    locked = false,
    updateRunning = false,
    onImport,
  }: {
    status: HostStatus | null;
    statusText?: string;
    locked?: boolean;
    updateRunning?: boolean;
    onImport: () => void;
  } = $props();

  const visible = $derived(softwareUpdateSectionVisible(status));
  const rows = $derived(status ? softwareUpdateInfoRows(status) : []);
</script>

{#if visible && status}
  <div class="panel-section">
    <h2>Software-Update</h2>
    <p class="hint">
      Für ein Update benötigen Sie eine <code>.pfupdate</code>-Datei. Mit dem Update wird ein Backup
      automatisch durchgeführt.
    </p>
    <dl class="status-grid maintenance-software-info">
      {#each rows as row (row.label)}
        <dt>{row.label}</dt>
        <dd>{row.value}</dd>
      {/each}
    </dl>
    <div class="actions-row">
      <button type="button" class="btn-secondary" disabled={locked} onclick={onImport}>
        {updateRunning ? 'Update läuft …' : 'Update-Paket wählen …'}
      </button>
    </div>
    {#if statusText}
      <p class="maintenance-backup-status">{statusText}</p>
    {/if}
  </div>
{/if}
