<script lang="ts">
  import { managerShell } from './manager-shell-state.svelte.js';
  import { deriveOverallStatus } from './health-header.js';
  import {
    isSetupEntryStatus,
    lanWarningText,
    showStatusOverallNotice,
    statusOverallNoticeClass,
  } from './status-view-model.js';
  import DeliveryImagesWarning from './DeliveryImagesWarning.svelte';
  import DeviceUrls from './DeviceUrls.svelte';
  import SetupEntry from './SetupEntry.svelte';
  import NetworkAccessSummary from './NetworkAccessSummary.svelte';
  import StatusGrid from './StatusGrid.svelte';
  import TlsResumeCard from './TlsResumeCard.svelte';

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
  const showOverall = $derived(
    showStatusOverallNotice(setupEntry, overall?.text),
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
    {#if setupEntry}
      <SetupEntry
        status={configSnapshot}
        {onSetupClick}
        {onLoadReleaseArchive}
      />
    {:else}
      {#if showOverall && overall}
        <p
          id="status-overall"
          class={statusOverallNoticeClass(overall.level)}
          aria-live="polite"
        >
          {overall.text}
        </p>
      {/if}
      <TlsResumeCard tls={configSnapshot.tls} onResume={onOpenNetwork} />
    {/if}
    <DeliveryImagesWarning
      status={configSnapshot}
      {setupEntry}
      {onLoadReleaseArchive}
    />
    {#if lanWarning}
      <p id="lan-warning" class="lan-warning">{lanWarning}</p>
    {/if}
    {#if !setupEntry}
      <NetworkAccessSummary status={configSnapshot} runtime={managerShell.runtimeSnapshot} runtimeError={managerShell.runtimeError} />
    {/if}
    <DeviceUrls status={configSnapshot} {setupEntry} {onOpenUrl} />
    {#if !setupEntry}
      <details><summary>Technische Installationsdetails</summary>
        <StatusGrid status={configSnapshot} {setupEntry} />
      </details>
    {/if}
  {/if}
</div>
