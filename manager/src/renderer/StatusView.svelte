<script lang="ts">
  import { managerShell } from './manager-shell-state.svelte.js';
  import { isSetupEntryStatus, lanWarningText } from './status-view-model.js';
  import DeliveryImagesWarning from './DeliveryImagesWarning.svelte';
  import DeviceUrls from './DeviceUrls.svelte';
  import SetupEntry from './SetupEntry.svelte';
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

  /** Status page shows saved config; live stack/probes live in HealthHeader (runtimeSnapshot). */
  const configSnapshot = $derived(managerShell.configSnapshot);
  const statusError = $derived(managerShell.statusError);
  const setupEntry = $derived(configSnapshot ? isSetupEntryStatus(configSnapshot) : false);
  const lanWarning = $derived(
    configSnapshot ? lanWarningText(configSnapshot, setupEntry) : null,
  );
</script>

<div id="status-view" class="app" hidden={managerShell.activeView !== 'status'}>
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
    <StatusGrid status={configSnapshot} {setupEntry} />
    <DeviceUrls status={configSnapshot} {setupEntry} {onOpenUrl} />
  {/if}
</div>
