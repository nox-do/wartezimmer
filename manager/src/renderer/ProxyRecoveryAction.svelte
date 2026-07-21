<script lang="ts">
  import { NETWORK_PROXY_RESTORE_HINT } from './network-view-model.js';

  let {
    disabled = false,
    onRestore,
  }: {
    disabled?: boolean;
    onRestore: () => void;
  } = $props();
</script>

<p class="hint network-proxy-restore-hint">{NETWORK_PROXY_RESTORE_HINT}</p>
<div class="actions-row">
  <button type="button" class="btn-secondary" {disabled} onclick={onRestore}>
    Proxy-Dienst wiederherstellen
  </button>
</div>
