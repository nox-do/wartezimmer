<script lang="ts">
  import type { HostStatus } from '../shared/host-status.js';
  import { DELIVERY_IMAGES_WARNING_TEXT, showDeliveryImagesWarning } from './status-view-model.js';

  let {
    status,
    setupEntry,
    onLoadReleaseArchive,
  }: {
    status: HostStatus;
    setupEntry: boolean;
    onLoadReleaseArchive: () => void;
  } = $props();

  const visible = $derived(showDeliveryImagesWarning(status, setupEntry));
</script>

{#if visible}
  <p id="delivery-images-warning" class="lan-warning">
    <span>{DELIVERY_IMAGES_WARNING_TEXT}</span>
    <button type="button" class="btn-link status-release-load" onclick={onLoadReleaseArchive}>
      Release-Paket wählen …
    </button>
  </p>
{/if}
