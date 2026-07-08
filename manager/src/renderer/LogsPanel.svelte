<script lang="ts">
  import IconButton from './IconButton.svelte';
  import { MAINTENANCE_LOG_SERVICES, logsDisplayText } from './maintenance-view-model.js';

  let {
    logsService,
    logsText,
    busy = false,
    onServiceChange,
    onRefresh,
  }: {
    logsService: string;
    logsText: string;
    busy?: boolean;
    onServiceChange: (service: string) => void;
    onRefresh: () => void;
  } = $props();
</script>

<div class="maintenance-section">
  <h2>Logs</h2>
  <div class="maintenance-logs-toolbar">
    <label>
      Service
      <select
        class="maintenance-select"
        value={logsService}
        disabled={busy}
        onchange={(event) => onServiceChange(event.currentTarget.value)}
      >
        {#each MAINTENANCE_LOG_SERVICES as service (service.value)}
          <option value={service.value}>{service.label}</option>
        {/each}
      </select>
    </label>
    <IconButton
      icon="rotate-cw"
      class="btn-secondary"
      ariaLabel="Logs aktualisieren"
      disabled={busy}
      onclick={onRefresh}
    />
  </div>
  <pre class="maintenance-logs">{logsDisplayText(logsText)}</pre>
</div>
