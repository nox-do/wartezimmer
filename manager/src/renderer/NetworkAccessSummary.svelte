<script lang="ts">
  import type { HostStatus } from '../shared/host-status.js';
  import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';
  import { networkAccessSummary } from './network-access-view-model.js';
  import { restrictedNetworkStatusSummary } from './restricted-network-view-model.js';

  let { status, runtime = null, runtimeError = null }: {
    status: HostStatus;
    runtime?: HostRuntimeHealth | null;
    runtimeError?: string | null;
  } = $props();
  const summary = $derived(networkAccessSummary(status, runtime, runtimeError));
  const restricted = $derived(restrictedNetworkStatusSummary(status.restrictedNetwork ?? {
    phase: 'unconfigured',
    health: 'not-configured',
    binding: null,
    exposedSurfaces: ['patient-portal'],
    portalHostname: status.tls?.portalHostname ?? null,
    lastError: null,
  }));
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
  {#if summary.dnsWarning}
    <p class="notice is-warn" role="status">{summary.dnsWarning}</p>
  {/if}
  {#if summary.tls}
    <p class="hint">Die Verbindung ist verschlüsselt.</p>
  {:else}
    <p class="hint">Bei HTTP kann der Browser „Nicht sicher“ anzeigen. HTTPS können Sie später einrichten.</p>
  {/if}
</section>

<section class="panel-section" aria-label="Patientenzugang">
  <h2>Patientenzugang</h2>
  <dl class="status-grid wizard-summary-grid">
    <dt>Portaladresse</dt><dd>{restricted.portalAddress}</dd>
    <dt>Status</dt><dd>{restricted.state}</dd>
    <dt>Adresse / Adapter</dt><dd>{restricted.binding}</dd>
    <dt>Freigegeben</dt><dd>Nur Patientenportal</dd>
  </dl>
  <p class="hint">
    Host-Firewall, Routing und tatsächliche Netztrennung bleiben Verantwortung der Praxis-IT.
    Das IP-Binding allein belegt keine Isolation.
  </p>
</section>
