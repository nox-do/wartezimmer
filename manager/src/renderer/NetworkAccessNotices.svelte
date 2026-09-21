<script lang="ts">
  import type { HostStatus } from '../shared/host-status.js';
  import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';
  import { networkAccessAlerts } from './network-access-view-model.js';
  let { status, runtime = null, runtimeError = null, onOpenNetwork }: {
    status: HostStatus;
    runtime?: HostRuntimeHealth | null;
    runtimeError?: string | null;
    onOpenNetwork?: () => void;
  } = $props();
  const alerts = $derived(networkAccessAlerts(status, runtime, runtimeError));
</script>

{#if alerts.length > 0}
  <div class="notice is-warn" role="status">
    {#each alerts as alert (alert)}<p>{alert}</p>{/each}
    {#if onOpenNetwork}
      <button type="button" class="btn-secondary" onclick={onOpenNetwork}>Netzwerk öffnen</button>
    {/if}
  </div>
{/if}
