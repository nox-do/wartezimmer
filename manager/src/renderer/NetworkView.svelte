<script lang="ts">
  import { onMount } from 'svelte';
  import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
  import { hostNetworkChanged } from './host-network-panels.js';
  import {
    createNetworkController,
    type NetworkController,
    type NetworkState,
  } from './network-controller.js';
  import { networkWarningText, proxyNeedsRestore, NETWORK_PROXY_RESTORE_HINT } from './network-view-model.js';
  import { resolvedLanIp } from './wizard-state.js';
  import { managerShell } from './manager-shell-state.svelte.js';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import LoadingOverlay from './LoadingOverlay.svelte';
  import MaintenanceSection from './MaintenanceSection.svelte';
  import NetworkTopologyDiagram from './NetworkTopologyDiagram.svelte';
  import NetworkBindingChecks from './NetworkBindingChecks.svelte';
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

  const showProxyRestore = $derived(
    Boolean(snapshot && snapshot.proxyEnabled && proxyNeedsRestore(snapshot.status)),
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
      <div class="maintenance-accordion">
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
            showProxyToggle={false}
            onChange={patchFields}
            onTest={() => controller?.testReachability()}
          />
        </MaintenanceSection>
      </div>
      <NetworkBindingChecks checks={snapshot.status?.networkBindings} />
    </section>

    <section class="panel-section panel-section--network network-config-section">
      <h2 class="wizard-subheading">Netzwerk-Einstellungen</h2>
      <p class="hint">
        Host-Adresse für Binding und optionaler Proxy-Server. Geräte-URLs folgen der Basis unter
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

      <div class="network-config-block" id="network-proxy-panel">
        <h3 class="network-config-subheading">Proxy-Server (optional)</h3>
        <p class="hint">
          Einstieg im Praxisnetz über Port 80 statt :8080. Das Caddy-Image ist im Release enthalten und
          startet nur, wenn Sie den Proxy aktivieren.
        </p>
        <label class="wizard-checkbox">
          <input
            type="checkbox"
            checked={snapshot.proxyEnabled}
            disabled={snapshot.busy}
            onchange={(event) =>
              patchFields({ proxyEnabled: (event.currentTarget as HTMLInputElement).checked })}
          />
          <span>Zugriff über Reverse Proxy auf Port 80</span>
        </label>
        {#if snapshot.proxyEnabled}
          <p class="hint">
            Direkter App-Port bleibt lokal unter <code>127.0.0.1:8080</code> erreichbar. Geräte-URLs
            unter „Erreichbarkeit“ nutzen dann Port 80.
          </p>
        {/if}
        {#if showProxyRestore}
          <p class="hint network-proxy-restore-hint">{NETWORK_PROXY_RESTORE_HINT}</p>
          <div class="actions-row">
            <button
              type="button"
              class="btn-secondary"
              disabled={snapshot.busy}
              onclick={() => controller?.restoreProxy()}
            >
              Proxy wiederherstellen
            </button>
          </div>
        {/if}
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
