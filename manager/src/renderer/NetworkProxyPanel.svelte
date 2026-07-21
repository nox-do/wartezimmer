<script lang="ts">
  import { NETWORK_PROXY_RESTORE_HINT } from './network-view-model.js';

  let {
    proxyEnabled,
    busy = false,
    showRestore = false,
    onChange,
    onRestore,
  }: {
    proxyEnabled: boolean;
    busy?: boolean;
    showRestore?: boolean;
    onChange: (proxyEnabled: boolean) => void;
    onRestore: () => void;
  } = $props();
</script>

<p class="hint">
  Einstieg im Praxisnetz über Port 80 statt :8080. Das Caddy-Image ist im Release enthalten und startet
  nur, wenn Sie den Proxy aktivieren.
</p>
<label class="wizard-checkbox">
  <input
    type="checkbox"
    checked={proxyEnabled}
    disabled={busy}
    onchange={(event) => onChange((event.currentTarget as HTMLInputElement).checked)}
  />
  <span>Zugriff über Reverse Proxy auf Port 80</span>
</label>
{#if proxyEnabled}
  <p class="hint">
    Direkter App-Port bleibt lokal unter <code>127.0.0.1:8080</code> erreichbar. Geräte-URLs unter
    „Erreichbarkeit“ nutzen dann Port 80.
  </p>
{/if}
{#if showRestore}
  <p class="hint network-proxy-restore-hint">{NETWORK_PROXY_RESTORE_HINT}</p>
  <div class="actions-row">
    <button type="button" class="btn-secondary" disabled={busy} onclick={onRestore}>
      Proxy wiederherstellen
    </button>
  </div>
{/if}
