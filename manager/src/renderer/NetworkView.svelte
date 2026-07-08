<script lang="ts">
  import { onMount } from 'svelte';
  import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';
  import type { HostStatus } from '../shared/host-status.js';
  import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
  import { hostNetworkChanged } from './host-network-panels.js';
  import {
    createNetworkController,
    type NetworkController,
    type NetworkState,
  } from './network-controller.js';
  import {
    getNetworkCallbacks,
    registerNetworkViewAdapter,
  } from './network-view-adapter.js';
  import { networkWarningText } from './network-view-model.js';
  import { resolvedLanIp } from './wizard-state.js';
  import { managerShell } from './manager-shell-state.svelte.js';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import LoadingOverlay from './LoadingOverlay.svelte';
  import NetworkTopologyDiagram from './NetworkTopologyDiagram.svelte';
  import NetworkBindingChecks from './NetworkBindingChecks.svelte';
  import LanIpPanel from './LanIpPanel.svelte';
  import GatewayPanel from './GatewayPanel.svelte';

  let snapshot = $state<NetworkState | null>(null);
  let viewLoading = $state(false);
  let confirmOpen = $state(false);
  let confirmMessage = $state('');
  let confirmAction: (() => void) | null = null;

  let controller: NetworkController | null = null;

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
      onAfterMutation: () => getNetworkCallbacks().onAfterMutation?.(),
      requestConfirm,
      onStateChange: syncSnapshot,
    });
    syncSnapshot();

    const unregister = registerNetworkViewAdapter({
      show(status: HostStatus) {
        controller?.show(status);
        syncSnapshot();
      },
      hide() {
        controller?.hide();
        syncSnapshot();
      },
      setLoading(loading: boolean) {
        viewLoading = loading;
      },
      applyConfigSnapshot(status: HostStatus) {
        controller?.applyConfigSnapshot(status);
        syncSnapshot();
      },
      applyRuntimeHealth(health: HostRuntimeHealth) {
        controller?.applyRuntimeHealth(health);
        syncSnapshot();
      },
    });

    return unregister;
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
    <section class="network-section">
      <NetworkTopologyDiagram
        lanIp={diagramLanIp}
        gatewayIp={snapshot.gatewayEnabled ? snapshot.gatewayIp : null}
        gatewayEnabled={snapshot.gatewayEnabled}
      />
      <NetworkBindingChecks checks={snapshot.status?.networkBindings} />
    </section>

    <section class="network-section">
      <h2 class="wizard-subheading">Netzwerk Praxis intern</h2>
      <p class="maintenance-hint">
        Host-Adresse für Terminal, TV, MFA und Ops im Praxis-LAN/-WLAN
        (<code>SETUP_LAN_APP_IP</code>). Geräte-URLs stehen auf dem Status-Screen.
      </p>
      <div id="network-lan-panel">
        <LanIpPanel
          state={snapshot}
          network={snapshot.network}
          status={snapshot.status}
          disabled={snapshot.busy}
          onChange={patchFields}
        />
      </div>
    </section>

    <section class="network-section">
      <h2 class="wizard-subheading">Gateway</h2>
      <p class="maintenance-hint">
        Für Gast-WLAN mit Captive Portal: Gateway-Werte in der Host-Konfiguration speichern. Die
        fachliche Portal-Aktivierung passiert in Praxis Flow.
      </p>
      <div id="network-gateway-panel">
        <GatewayPanel
          state={snapshot}
          network={snapshot.network}
          lanIpFallback={resolvedLanIp(snapshot)}
          disabled={snapshot.busy}
          onChange={patchFields}
        />
      </div>
      {#if warningText}
        <p class="wizard-hint">{warningText}</p>
      {/if}
      <div class="maintenance-actions">
        <button
          type="button"
          class="btn-secondary"
          disabled={snapshot.busy}
          onclick={() => controller?.apply()}
        >
          Übernehmen
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
