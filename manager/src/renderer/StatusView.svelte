<script lang="ts">
  import { managerShell } from './manager-shell-state.svelte.js';
  import { deriveOverallStatus } from './health-header.js';
  import { sandboxSignatureAgeNotice } from './sandbox-scanner-ui.js';
  import {
    isSetupEntryStatus,
    lanWarningText,
    showStatusOverallNotice,
    statusOverallNoticeClass,
  } from './status-view-model.js';
  import DeliveryImagesWarning from './DeliveryImagesWarning.svelte';
  import DeviceUrls from './DeviceUrls.svelte';
  import SetupEntry from './SetupEntry.svelte';
  import NetworkAccessNotices from './NetworkAccessNotices.svelte';
  import { networkAccessSummary } from './network-access-view-model.js';
  import { restrictedNetworkStatusSummary } from './restricted-network-view-model.js';
  import StatusGrid from './StatusGrid.svelte';
  import TlsResumeCard from './TlsResumeCard.svelte';
  import HostLifecycleSummary from './HostLifecycleSummary.svelte';

  let {
    onSetupClick,
    onLoadReleaseArchive,
    onOpenUrl,
    onOpenNetwork,
  }: {
    onSetupClick: () => void;
    onLoadReleaseArchive: () => void;
    onOpenUrl: (url: string) => void;
    onOpenNetwork: () => void;
  } = $props();

  /** Live stack/probes: HealthHeader tiles. Overall copy + facts live on this page. */
  const configSnapshot = $derived(managerShell.configSnapshot);
  const statusError = $derived(managerShell.statusError);
  const patientAccess = $derived(configSnapshot
    ? networkAccessSummary(configSnapshot, managerShell.runtimeSnapshot, managerShell.runtimeError).portalState
      ?? (configSnapshot.restrictedNetwork ? restrictedNetworkStatusSummary(configSnapshot.restrictedNetwork).state : 'Nicht eingerichtet')
    : null);
  const setupEntry = $derived(configSnapshot ? isSetupEntryStatus(configSnapshot) : false);
  const lanWarning = $derived(
    configSnapshot ? lanWarningText(configSnapshot, setupEntry) : null,
  );
  const overall = $derived(
    managerShell.runtimeError
      ? ({ text: 'Unbekannt', level: 'bad' } as const)
      : managerShell.runtimeSnapshot
        ? deriveOverallStatus(managerShell.runtimeSnapshot)
        : null,
  );
  const signatureNotice = $derived(
    sandboxSignatureAgeNotice(managerShell.runtimeSnapshot?.sandboxScanner),
  );
  const overallNotice = $derived(
    overall?.level === 'ok' && signatureNotice
      ? { text: signatureNotice, level: 'warn' as const }
      : overall,
  );
  const showOverall = $derived(
    showStatusOverallNotice(setupEntry, overallNotice?.text),
  );
</script>

<div
  id="status-view"
  class="app"
  hidden={managerShell.activeView !== 'status' || !managerShell.bootReady}
>
  {#if statusError && !configSnapshot}
    <p id="error-message" class="error">
      {statusError || 'Setup-API nicht erreichbar — bitte Manager neu starten.'}
    </p>
  {:else if configSnapshot}
    {#if statusError}
      <p id="error-message" class="error">{statusError}</p>
    {/if}
    {#if configSnapshot.lifecycle && configSnapshot.installation.kind !== 'docker-unavailable'}
      <HostLifecycleSummary lifecycle={configSnapshot.lifecycle} />
    {/if}
    {#if setupEntry}
      <SetupEntry
        status={configSnapshot}
        {onSetupClick}
        {onLoadReleaseArchive}
      />
    {:else}
      {#if showOverall && overallNotice}
        <p
          id="status-overall"
          class={statusOverallNoticeClass(overallNotice.level)}
          aria-live="polite"
        >
          {overallNotice.text}
        </p>
      {/if}
      <TlsResumeCard tls={configSnapshot.tls} onResume={onOpenNetwork} />
    {/if}
    <DeliveryImagesWarning
      status={configSnapshot}
      {setupEntry}
      {onLoadReleaseArchive}
    />
    {#if lanWarning && setupEntry}
      <p id="lan-warning" class="lan-warning">{lanWarning}</p>
    {/if}
    {#if !setupEntry}
      <NetworkAccessNotices status={configSnapshot} runtime={managerShell.runtimeSnapshot} runtimeError={managerShell.runtimeError} {onOpenNetwork} />
      <p>Patientenzugang: {patientAccess}</p>
    {/if}
    <DeviceUrls status={configSnapshot} {setupEntry} {onOpenUrl} />
    {#if !setupEntry}
      <details><summary>Technische Installationsdetails</summary>
        <StatusGrid status={configSnapshot} {setupEntry} />
      </details>
    {/if}
  {/if}
</div>
