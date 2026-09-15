<script lang="ts">
  import type { HostStatus } from '../shared/host-status.js';
  import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';
  import { networkAccessSummary } from './network-access-view-model.js';

  let { status, runtime = null, runtimeError = null }: {
    status: HostStatus;
    runtime?: HostRuntimeHealth | null;
    runtimeError?: string | null;
  } = $props();
  const summary = $derived(networkAccessSummary(status, runtime, runtimeError));
</script>

<section class="panel-section" aria-label="Aktueller Zugang">
  <h2>Interner Praxisbetrieb</h2>
  <dl class="status-grid wizard-summary-grid">
    <dt>Praxisadresse</dt><dd>{summary.address}</dd>
    <dt>Verbindung</dt><dd>{summary.connection}</dd>
    <dt>Zugang</dt><dd>{summary.access}</dd>
    <dt>Adresse / Adapter</dt><dd>{summary.adapter}</dd>
  </dl>
  <p class:notice={summary.needsAttention} class:is-warn={summary.needsAttention}>
    Letzte Host-Prüfung: {summary.diagnosis}.
  </p>
  <p class="hint">
    {#if summary.proxy}
      Praxis Flow ist über die ausgewählte Praxisadresse erreichbar.
    {:else}
      Praxis Flow ist auf allen Netzwerkkarten über Port 8080 erreichbar.
    {/if}
  </p>
  {#if summary.tls}
    <p class="hint">Die Verbindung ist verschlüsselt.</p>
  {:else}
    <p class="hint">Bei HTTP kann der Browser „Nicht sicher“ anzeigen. HTTPS können Sie später einrichten.</p>
  {/if}
</section>
