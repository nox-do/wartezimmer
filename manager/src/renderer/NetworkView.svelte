<script lang="ts">
  /**
   * Network tab layout (IT action order):
   * 1 Host/LAN → 2 Proxy → 3 Erreichbarkeit → Apply → 4 Prüfungen → 5 Erläuterung
   *
   * CAUTION — shell sync: three $effects below (session / config / runtime). Do not
   * merge casually; show() vs applyConfigSnapshot vs applyRuntimeHealth have different
   * dirty-field semantics (see network-controller).
   *
   * TODO: Wizard Zugang still embeds proxy/reachability separately — keep labels in sync
   * with NetworkProxyPanel / ReachabilityPanel, or extract shared step snippets later.
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
    networkLanSubtitle,
    networkProxySubtitle,
    networkReachabilitySubtitle,
    networkWarningText,
    proxyNeedsRestore,
  } from './network-view-model.js';
  import { resolvedLanIp } from './wizard-state.js';
  import { managerShell } from './manager-shell-state.svelte.js';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import LoadingOverlay from './LoadingOverlay.svelte';
  import MaintenanceSection from './MaintenanceSection.svelte';
  import NetworkTopologyDiagram from './NetworkTopologyDiagram.svelte';
  import NetworkBindingChecks from './NetworkBindingChecks.svelte';
  import NetworkProxyPanel from './NetworkProxyPanel.svelte';
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

  function applyExpanderDefaults(state: NetworkState): void {
    const defaults = networkExpanderDefaults({
      status: state.status!,
      proxyEnabled: state.proxyEnabled,
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

  const warningText = $derived(
    snapshot
      ? networkWarningText(
          snapshot.compose?.running ?? false,
          hostNetworkChanged(snapshot, snapshot.status, snapshot.network),
        )
      : null,
  );

  const showProxyRestore = $derived(
    Boolean(snapshot && snapshot.proxyEnabled && proxyNeedsRestore(snapshot.status)),
  );

  const hostChecks = $derived(
    snapshot ? networkHostChecksForDisplay(snapshot.status?.networkBindings) : [],
  );

  const diagramLanIp = $derived(
    snapshot ? resolvedLanIp(snapshot) || snapshot.status?.network.configuredLanIp : null,
  );

  onMount(() => {
    controller = createNetworkController({
      api: requireApi(),
      onAfterMutation,
      requestConfirm,
      onStateChange: syncSnapshot,
    });
    syncSnapshot();
  });

  $effect(() => {
    const c = controller;
    const session = managerShell.networkSession;
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
      lastSessionGeneration = session.generation;
      c.show(session.status);
      syncSnapshot();
      const state = c.getState();
      if (state.status) {
        applyExpanderDefaults(state);
      }
    }
  });

  $effect(() => {
    const c = controller;
    const status = managerShell.hostStatus;
    const session = managerShell.networkSession;
    if (!c || !status || !session) {
      return;
    }
    // Session-Start wendet denselben Snapshot bereits in show() an.
    if (status === session.status) {
      return;
    }
    c.applyConfigSnapshot(status);
    syncSnapshot();
  });

  $effect(() => {
    const c = controller;
    const health = managerShell.runtimeHealth;
    const session = managerShell.networkSession;
    if (!c || !health || !session || managerShell.activeView !== 'network') {
      return;
    }
    c.applyRuntimeHealth(health);
    syncSnapshot();
  });
</script>

<div
  id="network-view"
  class="app network"
  hidden={managerShell.activeView !== 'network'}
  aria-busy={viewLoading ? 'true' : 'false'}
>
  <LoadingOverlay loading={viewLoading} />

  {#if snapshot?.status}
    <section class="panel-section panel-section--network">
      <div class="maintenance-accordion">
        <MaintenanceSection
          open={lanOpen}
          title="Host / LAN-Adresse"
          subtitle={networkLanSubtitle(snapshot.status, snapshot)}
          onToggle={() => {
            lanOpen = !lanOpen;
          }}
        >
          <p class="hint">Adresse dieses Rechners im Praxisnetz (Binding, Stale-Check, Fallback).</p>
          <LanIpPanel
            state={snapshot}
            network={snapshot.network}
            status={snapshot.status}
            disabled={snapshot.busy}
            onChange={patchFields}
          />
        </MaintenanceSection>

        <MaintenanceSection
          open={proxyOpen}
          title="Proxy-Server"
          subtitle={networkProxySubtitle(snapshot.status, snapshot.proxyEnabled)}
          onToggle={() => {
            proxyOpen = !proxyOpen;
          }}
        >
          <NetworkProxyPanel
            proxyEnabled={snapshot.proxyEnabled}
            busy={snapshot.busy}
            showRestore={showProxyRestore}
            onChange={(proxyEnabled) => patchFields({ proxyEnabled })}
            onRestore={() => controller?.restoreProxy()}
          />
        </MaintenanceSection>

        <MaintenanceSection
          open={reachabilityOpen}
          title="Erreichbarkeit im Praxisnetz"
          subtitle={networkReachabilitySubtitle(snapshot.status)}
          onToggle={() => {
            reachabilityOpen = !reachabilityOpen;
          }}
        >
          <ReachabilityPanel
            state={snapshot}
            network={snapshot.network}
            disabled={snapshot.busy}
            probeBusy={snapshot.reachabilityProbeBusy}
            probeMessage={snapshot.reachabilityProbeMessage}
            probeOk={snapshot.reachabilityProbeOk}
            showProxyToggle={false}
            onChange={patchFields}
            onTest={() => controller?.testReachability()}
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
          disabled={snapshot.busy}
          onclick={() => controller?.apply()}
        >
          Netzwerk-Einstellungen übernehmen
        </button>
      </div>
      {#if snapshot.networkStatusText}
        <p class="maintenance-backup-status">{snapshot.networkStatusText}</p>
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

    {#if snapshot.error}
      <p class="error">{snapshot.error}</p>
    {/if}
  {/if}

  <ConfirmDialog open={confirmOpen} onConfirm={confirmAndRun} onCancel={closeConfirm}>
    <p>{confirmMessage}</p>
  </ConfirmDialog>
</div>
