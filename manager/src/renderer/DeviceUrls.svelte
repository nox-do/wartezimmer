<script lang="ts">
  import type { HostStatus } from '../shared/host-status.js';
  import { deviceUrlEntries } from './status-view-model.js';
  import DeviceUrlItem from './DeviceUrlItem.svelte';

  let {
    status,
    setupEntry,
    onOpenUrl,
  }: {
    status: HostStatus;
    setupEntry: boolean;
    onOpenUrl: (url: string) => void;
  } = $props();

  const entries = $derived(deviceUrlEntries(status));
  const visible = $derived(Boolean(entries && !setupEntry));
</script>

{#if visible && entries}
  <section class="device-urls" id="device-urls-section">
    <h2>Interne Zugänge</h2>
    <ul id="device-urls-list" class="device-urls-list">
      {#each entries as entry (entry.label)}
        <DeviceUrlItem {entry} {onOpenUrl} />
      {/each}
    </ul>
  </section>
{/if}
