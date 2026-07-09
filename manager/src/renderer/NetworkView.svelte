<script lang="ts">
  import { onMount } from 'svelte';
  import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
  import { hostNetworkChanged } from './host-network-panels.js';
  import {
    createNetworkController,
    type NetworkController,
    type NetworkState,
  } from './network-controller.js';
  import { networkWarningText } from './network-view-model.js';
  import { resolvedLanIp } from './wizard-state.js';
  import { managerShell } from './manager-shell-state.svelte.js';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import LoadingOverlay from './LoadingOverlay.svelte';
  import MaintenanceSection from './MaintenanceSection.svelte';
  import NetworkTopologyDiagram from './NetworkTopologyDiagram.svelte';
  import NetworkBindingChecks from './NetworkBindingChecks.svelte';
  import LanIpPanel from './LanIpPanel.svelte';
  import GatewayPanel from './GatewayPanel.svelte';
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
  let topologyOpen = $state(false);
  let reachabilityOpen = $state(true);

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
          hostNetworkChanged(snapshot, snapshot.status),
        )
      : null,
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

  {#if snapshot}
    <section class="panel-section panel-section--network">
      <MaintenanceSection
        open={topologyOpen}
        title="Erläuterung zu den Betriebsarten"
        subtitle="Betrieb mit oder ohne Patientenportal"
        onToggle={() => {
          topologyOpen = !topologyOpen;
        }}
      >
        <NetworkTopologyDiagram
          lanIp={diagramLanIp}
          gatewayIp={snapshot.gatewayEnabled ? snapshot.gatewayIp : null}
          gatewayEnabled={snapshot.gatewayEnabled}
        />
      </MaintenanceSection>
      <MaintenanceSection
        open={reachabilityOpen}
        title="Erreichbarkeit im Praxisnetz"
        subtitle={snapshot.status?.configuredCanonicalBaseUrl ||
          snapshot.status?.appBaseUrl ||
          'Basis-URL für Geräte wählen'}
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
          onChange={patchFields}
          onTest={() => controller?.testReachability()}
        />
      </MaintenanceSection>
      <NetworkBindingChecks checks={snapshot.status?.networkBindings} />
    </section>

    <section class="panel-section panel-section--network network-config-section">
      <h2 class="wizard-subheading">Netzwerk-Einstellungen</h2>
      <p class="hint">
        Host-Adresse für Binding und optionale Gast-WLAN-Werte. Geräte-URLs folgen der Basis unter
        „Erreichbarkeit“.
      </p>

      <div class="network-config-block" id="network-lan-panel">
        <h3 class="network-config-subheading">LAN-Adresse (Host / Binding)</h3>
        <p class="hint">Adresse dieses Rechners im Praxisnetz (für Stale-Check und Fallback).</p>
        <LanIpPanel
          state={snapshot}
          network={snapshot.network}
          status={snapshot.status}
          disabled={snapshot.busy}
          onChange={patchFields}
        />
      </div>

      <div class="network-config-block" id="network-gateway-panel">
        <h3 class="network-config-subheading">Gast-WLAN (optional)</h3>
        <p class="hint">
          Technische Werte für Captive Portal speichern. Das Portal selbst aktivieren Sie später in
          Praxis Flow (Betrieb).
        </p>
        <GatewayPanel
          state={snapshot}
          network={snapshot.network}
          lanIpFallback={resolvedLanIp(snapshot)}
          disabled={snapshot.busy}
          onChange={patchFields}
        />
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
    </section>

    {#if snapshot.error}
      <p class="error">{snapshot.error}</p>
    {/if}
  {/if}

  <ConfirmDialog open={confirmOpen} onConfirm={confirmAndRun} onCancel={closeConfirm}>
    <p>{confirmMessage}</p>
  </ConfirmDialog>
</div>
