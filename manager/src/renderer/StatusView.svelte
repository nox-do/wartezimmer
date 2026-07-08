<script lang="ts">
  import { managerShell } from './manager-shell-state.svelte.js';
  import { isSetupEntryStatus, lanWarningText } from './status-view-model.js';
  import DeliveryImagesWarning from './DeliveryImagesWarning.svelte';
  import DeviceUrls from './DeviceUrls.svelte';
  import SetupEntry from './SetupEntry.svelte';
  import StatusGrid from './StatusGrid.svelte';

  let {
    onSetupClick,
    onLoadReleaseArchive,
    onOpenUrl,
  }: {
    onSetupClick: () => void;
    onLoadReleaseArchive: () => void;
    onOpenUrl: (url: string) => void;
  } = $props();

  const hostStatus = $derived(managerShell.hostStatus);
  const displayError = $derived(managerShell.statusError ?? managerShell.runtimeError);
  const setupEntry = $derived(hostStatus ? isSetupEntryStatus(hostStatus) : false);
  const lanWarning = $derived(
    hostStatus && !displayError ? lanWarningText(hostStatus, setupEntry) : null,
  );
</script>

<div id="status-view" class="app" hidden={managerShell.activeView !== 'status'}>
  {#if displayError}
    <p id="error-message" class="error">
      {displayError || 'Setup-API nicht erreichbar — bitte Manager neu starten.'}
    </p>
  {:else if hostStatus}
    {#if setupEntry}
      <SetupEntry
        status={hostStatus}
        {onSetupClick}
        {onLoadReleaseArchive}
      />
    {/if}
    <DeliveryImagesWarning
      status={hostStatus}
      {setupEntry}
      {onLoadReleaseArchive}
    />
    {#if lanWarning}
      <p id="lan-warning" class="lan-warning">{lanWarning}</p>
    {/if}
    <StatusGrid status={hostStatus} {setupEntry} />
    <DeviceUrls status={hostStatus} {setupEntry} {onOpenUrl} />
  {/if}
</div>
