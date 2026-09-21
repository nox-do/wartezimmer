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
    {#if summary.operatingMode}
      <dt>Betriebsmodus</dt><dd>{summary.operatingMode}</dd>
    {/if}
    <dt>Praxisadresse</dt><dd>{summary.address}</dd>
    <dt>Verbindung</dt><dd>{summary.connection}</dd>
    <dt>Zugang</dt><dd>{summary.access}</dd>
    <dt>Adresse / Adapter</dt><dd>{summary.adapter}</dd>
  </dl>
  {#if !summary.needsAttention}
    <p class="hint">Letzte Host-Prüfung: {summary.diagnosis}.</p>
  {/if}
</section>

<section class="panel-section" aria-label="Patientenzugang">
  <h2>Patientenzugang</h2>
  <dl class="status-grid wizard-summary-grid">
    <dt>Portaladresse</dt><dd>{restricted.portalAddress}</dd>
    <dt>Status</dt><dd>{summary.portalState ?? restricted.state}</dd>
    <dt>Adresse / Adapter</dt><dd>{restricted.binding}</dd>
    <dt>Freigegeben</dt><dd>{status.lifecycle?.assessment === 'known' && status.lifecycle.mode === 'https-portal' && status.restrictedNetwork?.phase === 'applied' ? 'Nur Patientenportal' : 'Keine separate Freigabe'}</dd>
  </dl>
</section>
