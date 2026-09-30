<script lang="ts">
  import HealthHeader from './HealthHeader.svelte';
  import { hasBlockingMaintenanceOperation } from '@praxis-flow/server-shared/manager-status-projection';
  import type { HostStatus } from '../shared/host-status.js';
  import {
    runtimeSnapshot as observedSnapshot,
    runtimeObservationNotice,
  } from './runtime-observation.js';
  import { managerShell } from './manager-shell-state.svelte.js';
  import { tabDisabled } from './manager-main-nav.js';
  import { managerStatusViewModel } from './manager-status-view-model.js';
  import { evaluateHostLifecycleAction } from '@praxis-flow/server-shared/host-lifecycle-policy';
  import { sandboxSignatureAgeNotice } from './sandbox-scanner-ui.js';
  import {
    isSetupEntryStatus,
    lanWarningText,
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
    onOpenMaintenance,
    onRefresh,
  }: {
    onSetupClick: () => void;
    onLoadReleaseArchive: () => void;
    onOpenUrl: (url: string) => void;
    onOpenNetwork: () => void;
    onOpenMaintenance: () => void;
    onRefresh: () => void | Promise<void>;
  } = $props();

  /** Live stack/probes: HealthHeader tiles. Overall copy + facts live on this page. */
  const runtimeSnapshot = $derived(observedSnapshot(managerShell.runtimeObservation));
  const runtimeNotice = $derived(runtimeObservationNotice(managerShell.runtimeObservation));
  const configSnapshot = $derived(managerShell.configSnapshot);
  let startInstallation = $state<HostStatus['installation']>(null);
  const projectionStatus = $derived(
    configSnapshot && startInstallation
      ? { ...configSnapshot, installation: startInstallation }
      : configSnapshot,
  );
  $effect(() => {
    configSnapshot;
    startInstallation = null;
  });
  const statusError = $derived(managerShell.statusError);
  const patientAccess = $derived(configSnapshot
    ? networkAccessSummary(configSnapshot, runtimeSnapshot, runtimeNotice).portalState
      ?? (configSnapshot.restrictedNetwork ? restrictedNetworkStatusSummary(configSnapshot.restrictedNetwork).state : 'Nicht eingerichtet')
    : null);
  const setupEntry = $derived(configSnapshot ? isSetupEntryStatus(configSnapshot) : false);
  const lanWarning = $derived(
    configSnapshot ? lanWarningText(configSnapshot, setupEntry) : null,
  );
  const overall = $derived(
    managerStatusViewModel(projectionStatus, managerShell.runtimeObservation),
  );
  const primary = $derived(overall.primary);
  const signatureNotice = $derived(sandboxSignatureAgeNotice(runtimeSnapshot?.sandboxScanner));
  const startGuard = $derived(configSnapshot?.lifecycle
    ? evaluateHostLifecycleAction(configSnapshot.lifecycle, 'stack-start') : null);
  let diagnosisOpen = $state(false);
  const networkDisabled = $derived(tabDisabled('network', configSnapshot, runtimeSnapshot));
  let actionBusy = $state(false);
  let actionError = $state<string | null>(null);
  async function runAction(action: () => void | Promise<void>) {
    actionBusy = true;
    actionError = null;
    try { await action(); } catch (error) {
      actionError = error instanceof Error ? error.message : String(error);
    } finally { actionBusy = false; }
  }
  async function startExisting() {
    const result = await window.praxisManager.startStoppedInstallation();
    if (!result.installation || result.installation.kind === 'healthy') await onRefresh();
    else startInstallation = result.installation;
  }
  function openDiagnosis() {
    const target = primary.area === 'network' || primary.area === 'tls' || primary.code === 'proxy-unavailable' ? 'network' : 'maintenance';
    if (tabDisabled(target, configSnapshot, runtimeSnapshot)) diagnosisOpen = true;
    else if (target === 'network') onOpenNetwork();
    else onOpenMaintenance();
  }
</script>

<div
  id="status-view"
  class="app"
  hidden={managerShell.activeView !== 'status' || !managerShell.bootReady}
>
  <HealthHeader />
  {#if statusError && !configSnapshot}
    <p id="error-message" class="error">
      {statusError || 'Setup-API nicht erreichbar — bitte Manager neu starten.'}
    </p>
  {:else if configSnapshot}
    {#if statusError}
      <p id="error-message" class="error">{statusError}</p>
    {/if}
    <p id="status-overall" class={overall.noticeClass} aria-live="polite">{primary.summary}</p>
    {#if primary.detail && !setupEntry}<p>{primary.detail}</p>{/if}
    {#if primary.recommendedAction === 'install' || primary.recommendedAction === 'reinstall' || primary.code === 'installation-open'}
      <button type="button" onclick={onSetupClick}>{primary.recommendedAction === 'install' ? 'Einrichtung starten' : primary.recommendedAction === 'reinstall' ? 'Neu installieren …' : 'Vorgang öffnen'}</button>
    {:else if primary.recommendedAction === 'start'}
      <button type="button" disabled={actionBusy || !startGuard?.allowed} onclick={() => void runAction(startExisting)}>Vorhandene Installation starten</button>
      {#if startGuard?.reason}<p class="hint">{startGuard.reason}</p>{/if}
    {:else if primary.recommendedAction === 'retry-observation'}
      <button type="button" disabled={actionBusy} onclick={() => void runAction(onRefresh)}>Status erneut prüfen</button>
    {:else if primary.recommendedAction === 'continue-operation'}
      <button type="button" disabled={Boolean(networkDisabled)} onclick={onOpenNetwork}>Vorgang öffnen</button>
      {#if networkDisabled}<p class="hint">{networkDisabled}</p>{/if}
    {:else if primary.recommendedAction === 'repair' || primary.recommendedAction === 'inspect-configuration'}
      <button type="button" onclick={openDiagnosis}>Diagnose öffnen</button>
    {/if}
    {#if actionError}<p class="error">{actionError}</p>{/if}
    {#if configSnapshot.lifecycle && configSnapshot.installation?.kind !== 'inconsistent'}
      <HostLifecycleSummary lifecycle={configSnapshot.lifecycle} />
    {/if}
    {#if setupEntry}
      <SetupEntry
        status={projectionStatus ?? configSnapshot}
        {onLoadReleaseArchive}
      />
    {/if}
    {#if signatureNotice}<p class="hint">{signatureNotice}</p>{/if}
    {#if !hasBlockingMaintenanceOperation(configSnapshot)}
      <TlsResumeCard tls={configSnapshot.tls} onResume={onOpenNetwork} />
      <DeliveryImagesWarning
        status={configSnapshot}
        {setupEntry}
        {onLoadReleaseArchive}
      />
    {/if}
    {#if lanWarning && setupEntry}
      <p id="lan-warning" class="lan-warning">{lanWarning}</p>
    {/if}
    {#if !setupEntry}
      <NetworkAccessNotices status={configSnapshot} runtime={runtimeSnapshot} runtimeError={runtimeNotice} {onOpenNetwork} />
      {#if configSnapshot.restrictedNetwork?.phase === 'applied'}
        <p>Patientenzugang: {patientAccess}</p>
      {/if}
    {/if}
    <DeviceUrls status={configSnapshot} {setupEntry} {onOpenUrl} />
    <details bind:open={diagnosisOpen}><summary>Technische Installationsdetails</summary>
      <StatusGrid status={configSnapshot} setupEntry={false} />
    </details>
  {/if}
</div>
