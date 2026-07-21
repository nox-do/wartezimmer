<script lang="ts">
  /**
   * Network tab layout (IT action order):
   * 1 Host/LAN → 2 Proxy → 3 Erreichbarkeit → Apply+Verify → 4 Prüfungen → 5 Erläuterung
   *
   * Shell: configSnapshot + runtimeSnapshot via $derived / selectors.
   * Controller: draft + phase/notice + network snapshot; hydration via syncFromConfig.
   * One lifecycle $effect for session open/close and config refresh.
   */
  import { onMount } from 'svelte';
  import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
  import { hostNetworkChanged } from './host-network-panels.js';
  import {
    createNetworkController,
    type NetworkController,
    type NetworkState,
  } from './network-controller.js';
  import {
    networkExpanderDefaults,
    networkHostChecksForDisplay,
    networkHostChecksSubtitle,
    networkIsBusy,
    networkLanSubtitle,
    networkPhaseProgressText,
    networkProxySubtitle,
    networkReachabilitySubtitle,
    networkWarningText,
    NETWORK_STACK_STOPPED_VERIFY_HINT,
    proxyNeedsRestore,
    savedDeviceBaseUrl,
  } from './network-view-model.js';
  import { effectiveCompose, effectiveConfiguredLanIp } from './host-snapshot-selectors.js';
  import { resolvedLanIp } from './wizard-state.js';
  import { managerShell } from './manager-shell-state.svelte.js';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import LoadingOverlay from './LoadingOverlay.svelte';
  import MaintenanceSection from './MaintenanceSection.svelte';
  import NetworkTopologyDiagram from './NetworkTopologyDiagram.svelte';
  import NetworkBindingChecks from './NetworkBindingChecks.svelte';
  import ProxySettings from './ProxySettings.svelte';
  import ProxyRecoveryAction from './ProxyRecoveryAction.svelte';
  import LanIpPanel from './LanIpPanel.svelte';
  import ReachabilityPanel from './ReachabilityPanel.svelte';

  let {
    onAfterMutation,
  }: {
    onAfterMutation: () => void;
  } = $props();

  let snapshot = $state<NetworkState | null>(null);
  let confirmOpen = $state(false);
  let confirmMessage = $state('');
  let confirmAction: (() => void) | null = null;

  let lanOpen = $state(false);
  let proxyOpen = $state(false);
  let reachabilityOpen = $state(true);
  let checksOpen = $state(false);
  let topologyOpen = $state(false);

  let controller = $state<NetworkController | null>(null);
  let lastSessionGeneration = $state<number | null>(null);

  const viewLoading = $derived(managerShell.viewLoading.network);
  const configSnapshot = $derived(managerShell.configSnapshot);
  const runtimeSnapshot = $derived(managerShell.runtimeSnapshot);
  const compose = $derived(effectiveCompose(configSnapshot, runtimeSnapshot));

  function requireApi(): PraxisManagerApi {
    const api = window.praxisManager;
    if (!api) {
      throw new Error(
        'Preload nicht geladen — Manager neu starten. (Hinweis: DevTools → Console nach Preload-Fehlern prüfen.)',
      );
    }
    return api;
  }

  function syncSnapshot(): void {
    snapshot = controller ? { ...controller.getState() } : null;
  }

  function applyExpanderDefaults(draft: NetworkState): void {
    if (!configSnapshot) {
      return;
    }
    const defaults = networkExpanderDefaults({
      status: configSnapshot,
      proxyEnabled: draft.proxyEnabled,
      runtime: runtimeSnapshot,
    });
    lanOpen = defaults.lanOpen;
    proxyOpen = defaults.proxyOpen;
    reachabilityOpen = defaults.reachabilityOpen;
    checksOpen = defaults.checksOpen;
    topologyOpen = defaults.topologyOpen;
  }

  function requestConfirm(message: string, onConfirm: () => void): void {
    confirmMessage = message;
    confirmAction = onConfirm;
    confirmOpen = true;
  }

  function closeConfirm(): void {
    confirmOpen = false;
    confirmMessage = '';
    confirmAction = null;
  }

  function confirmAndRun(): void {
    const action = confirmAction;
    closeConfirm();
    action?.();
  }

  function patchFields(patch: Parameters<NetworkController['patchFields']>[0]): void {
    controller?.patchFields(patch);
    syncSnapshot();
  }

  const dirty = $derived(
    snapshot ? hostNetworkChanged(snapshot, configSnapshot, snapshot.network) : false,
  );

  const busy = $derived(snapshot ? networkIsBusy(snapshot.phase) : false);

  const progressText = $derived(
    snapshot && busy ? networkPhaseProgressText(snapshot.phase) : '',
  );

  const warningText = $derived(
    snapshot ? networkWarningText(compose?.running ?? false, dirty) : null,
  );

  const showProxyRestore = $derived(
    Boolean(
      snapshot &&
        snapshot.proxyEnabled &&
        proxyNeedsRestore(configSnapshot, runtimeSnapshot),
    ),
  );

  const hostChecks = $derived(
    configSnapshot ? networkHostChecksForDisplay(configSnapshot.networkBindings) : [],
  );

  const diagramLanIp = $derived(
    snapshot
      ? resolvedLanIp(snapshot) || effectiveConfiguredLanIp(configSnapshot, runtimeSnapshot)
      : null,
  );

  const savedUrl = $derived(savedDeviceBaseUrl(configSnapshot));

  onMount(() => {
    controller = createNetworkController({
      api: requireApi(),
      getConfig: () => managerShell.configSnapshot,
      getRuntime: () => managerShell.runtimeSnapshot,
      onAfterMutation,
      requestConfirm,
      onStateChange: syncSnapshot,
    });
    syncSnapshot();
  });

  $effect(() => {
    const c = controller;
    const session = managerShell.networkSession;
    const config = managerShell.configSnapshot;
    if (!c) {
      return;
    }

    if (!session) {
      if (lastSessionGeneration !== null) {
        c.hide();
        syncSnapshot();
        lastSessionGeneration = null;
      }
      return;
    }

    if (session.generation !== lastSessionGeneration) {
      if (!config) {
        return;
      }
      lastSessionGeneration = session.generation;
      c.show();
      syncSnapshot();
      applyExpanderDefaults(c.getState());
      return;
    }

    // Same session: config refresh → controller decides hydrate vs keep dirty draft.
    if (config) {
      c.syncFromConfig();
      syncSnapshot();
    }
  });
</script>

<div
  id="network-view"
  class="app network"
  hidden={managerShell.activeView !== 'network'}
  aria-busy={viewLoading ? 'true' : 'false'}
>
  <LoadingOverlay loading={viewLoading} />

  {#if configSnapshot && snapshot}
    <section class="panel-section panel-section--network">
      <div class="maintenance-accordion">
        <MaintenanceSection
          open={lanOpen}
          title="Adresse dieses Rechners"
          subtitle={networkLanSubtitle(configSnapshot, snapshot)}
          onToggle={() => {
            lanOpen = !lanOpen;
          }}
        >
          <p class="hint">
            IP dieses Rechners im Praxisnetz. Wenn sie nicht mehr stimmt, hier anpassen und übernehmen.
          </p>
          <LanIpPanel
            state={snapshot}
            network={snapshot.network}
            status={configSnapshot}
            disabled={busy}
            onChange={patchFields}
          />
        </MaintenanceSection>

        <MaintenanceSection
          open={proxyOpen}
          title="Gerätezugriff (Port 80)"
          subtitle={networkProxySubtitle(configSnapshot, snapshot.proxyEnabled, runtimeSnapshot)}
          onToggle={() => {
            proxyOpen = !proxyOpen;
          }}
        >
          <ProxySettings
            enabled={snapshot.proxyEnabled}
            disabled={busy}
            onChange={(proxyEnabled) => patchFields({ proxyEnabled })}
          />
          {#if showProxyRestore}
            <ProxyRecoveryAction disabled={busy} onRestore={() => controller?.restoreProxy()} />
          {/if}
        </MaintenanceSection>

        <MaintenanceSection
          open={reachabilityOpen}
          title="Adresse für Terminal, TV und MFA"
          subtitle={networkReachabilitySubtitle(configSnapshot)}
          onToggle={() => {
            reachabilityOpen = !reachabilityOpen;
          }}
        >
          <ReachabilityPanel
            state={snapshot}
            network={snapshot.network}
            disabled={busy}
            savedBaseUrl={savedUrl}
            verifyBusy={snapshot.phase === 'checking'}
            verifyEnabled={Boolean(compose?.running)}
            verifyDisabledHint={NETWORK_STACK_STOPPED_VERIFY_HINT}
            onChange={patchFields}
            onVerifySaved={() => controller?.verifyActiveConfiguration(savedUrl)}
          />
        </MaintenanceSection>
      </div>

      {#if warningText}
        <p class="hint">{warningText}</p>
      {/if}
      <div class="actions-row network-config-actions">
        <button
          type="button"
          class="btn-secondary"
          disabled={busy || !dirty}
          onclick={() => controller?.applyAndVerify()}
        >
          Einstellungen übernehmen und prüfen
        </button>
        {#if dirty}
          <button
            type="button"
            class="btn-secondary"
            disabled={busy}
            onclick={() => {
              controller?.discardDraft();
              syncSnapshot();
            }}
          >
            Änderungen verwerfen
          </button>
        {/if}
      </div>
      {#if progressText}
        <p class="maintenance-backup-status">{progressText}</p>
      {:else if snapshot.notice}
        <p
          class={snapshot.notice.tone === 'error'
            ? 'error'
            : snapshot.notice.tone === 'warning'
              ? 'lan-warning'
              : 'maintenance-backup-status'}
        >
          {snapshot.notice.message}
        </p>
      {/if}

      <div class="maintenance-accordion network-diagnose-accordion">
        <MaintenanceSection
          open={checksOpen}
          title="Prüfungen am Rechner"
          subtitle={networkHostChecksSubtitle(hostChecks)}
          onToggle={() => {
            checksOpen = !checksOpen;
          }}
        >
          <NetworkBindingChecks checks={hostChecks} />
        </MaintenanceSection>

        <MaintenanceSection
          open={topologyOpen}
          title="Erläuterung zum Netz"
          subtitle="Portal mit Praxis-IT-Captive oder nur Praxis-intern"
          onToggle={() => {
            topologyOpen = !topologyOpen;
          }}
        >
          <NetworkTopologyDiagram lanIp={diagramLanIp} />
        </MaintenanceSection>
      </div>
    </section>
  {/if}

  <ConfirmDialog open={confirmOpen} onConfirm={confirmAndRun} onCancel={closeConfirm}>
    <p>{confirmMessage}</p>
  </ConfirmDialog>
</div>
