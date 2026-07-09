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

  let logsEl: HTMLPreElement | undefined = $state();
  const hasLogs = $derived(Boolean(logsText.trim()));

  $effect(() => {
    // Scroll to newest lines (bottom) whenever the log payload changes.
    void logsText;
    const el = logsEl;
    if (!el) return;
    queueMicrotask(() => {
      el.scrollTop = el.scrollHeight;
    });
  });
</script>

<div class="panel-section">
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
  <p class="hint maintenance-logs-order">Neueste Einträge unten</p>
  <pre bind:this={logsEl} class="maintenance-logs" aria-live="polite"
    ><span class="maintenance-logs-body">{logsDisplayText(logsText)}</span
    >{#if hasLogs}<span class="maintenance-logs-cursor" aria-hidden="true"></span>{/if}</pre
  >
</div>
