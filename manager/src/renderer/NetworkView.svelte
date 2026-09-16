<script lang="ts">
  /**
   * Network tab layout:
   * 1 IP und Geräteadresse inklusive Prüfungen → 2 Proxy → 3 HTTPS → 4 Erläuterung
   * Draft apply lives in the open LAN / Proxy expander.
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
    NETWORK_APPLY_BUTTON_LABEL,
    NETWORK_DISCARD_BUTTON_LABEL,
    NETWORK_PROXY_EXPANDER_TITLE,
    networkDraftCommitPlacement,
    networkExpanderDefaults,
    networkHostChecksForDisplay,
    networkHostChecksSubtitle,
    networkIsBusy,
    networkLanSubtitle,
    networkPhaseProgressText,
    networkProxySubtitle,
    networkWarningText,
    NETWORK_STACK_STOPPED_VERIFY_HINT,
    proxyNeedsRestore,
    savedDeviceBaseUrl,
  } from './network-view-model.js';
  import { effectiveCompose, effectiveConfiguredLanIp } from './host-snapshot-selectors.js';
  import { resolvedLanIp } from './wizard-state.js';
  import { managerShell } from './manager-shell-state.svelte.js';
  import { deriveOverallStatus } from './health-header.js';
  import { statusOverallNoticeClass } from './status-view-model.js';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import LoadingOverlay from './LoadingOverlay.svelte';
  import MaintenanceSection from './MaintenanceSection.svelte';
  import NetworkAccessSummary from './NetworkAccessSummary.svelte';
  import { networkAccessSummary } from './network-access-view-model.js';
  import NetworkTopologyDiagram from './NetworkTopologyDiagram.svelte';
  import NetworkBindingChecks from './NetworkBindingChecks.svelte';
  import ProxySettings from './ProxySettings.svelte';
  import ProxyRecoveryAction from './ProxyRecoveryAction.svelte';
  import LanIpPanel from './LanIpPanel.svelte';
  import DeviceAddressPreview from './DeviceAddressPreview.svelte';
  import { draftCanonicalBaseUrl, existingHttpHostname } from './reachability.js';
  import TlsNetworkPanel from './TlsNetworkPanel.svelte';
  import { createTlsNetworkController, tlsNetworkLocksHost, type TlsNetworkController, type TlsNetworkState } from './tls-network-controller.js';
  import { tlsNetworkSubtitle } from './tls-network-view-model.js';

  let {
    onAfterMutation,
  }: {
    onAfterMutation: () => void | Promise<void>;
  } = $props();

  let snapshot = $state<NetworkState | null>(null);
  let confirmOpen = $state(false);
  let confirmMessage = $state('');
  let confirmAction: (() => void) | null = null;
  let confirmCancel: (() => void) | null = null;

  let lanOpen = $state(false);
  let proxyOpen = $state(false);
  let topologyOpen = $state(false);
  let draftOutcomeHost = $state<'lan' | 'proxy' | 'repair' | null>(null);

  let controller = $state<NetworkController | null>(null);
  let lastSessionGeneration = $state<number | null>(null);
  let tlsController = $state<TlsNetworkController | null>(null);
  let tlsSnapshot = $state<TlsNetworkState | null>(null);
  let tlsOpen = $state(true);

  const viewLoading = $derived(managerShell.viewLoading.network);
  const configSnapshot = $derived(managerShell.configSnapshot);
  const runtimeSnapshot = $derived(managerShell.runtimeSnapshot);
  const compose = $derived(effectiveCompose(configSnapshot, runtimeSnapshot));
  const tlsCutoverApplied = $derived(configSnapshot?.tls?.cutoverApplied === true);
  const tlsPreparationActive = $derived(
    Boolean(
      configSnapshot?.tls &&
        configSnapshot.tls.state !== 'off' &&
        !configSnapshot.tls.cutoverApplied,
    ),
  );

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
    topologyOpen = defaults.topologyOpen;
    tlsOpen = defaults.tlsOpen;
  }

  function requestConfirm(message: string, onConfirm: () => void, onCancel?: () => void): void {
    confirmMessage = message;
    confirmAction = onConfirm;
    confirmCancel = onCancel ?? null;
    confirmOpen = true;
  }

  function closeConfirm(): void {
    const cancel = confirmCancel;
    confirmOpen = false;
    confirmMessage = '';
    confirmAction = null;
    confirmCancel = null;
    cancel?.();
  }

  function confirmAndRun(): void {
    const action = confirmAction;
    confirmOpen = false;
    confirmMessage = '';
    confirmAction = null;
    confirmCancel = null;
    action?.();
  }

  function patchFields(patch: Parameters<NetworkController['patchFields']>[0]): void {
    controller?.patchFields(patch);
  }

  function applyDraftFrom(host: 'lan' | 'proxy'): void {
    draftOutcomeHost = host;
    controller?.applyAndVerify();
  }

  function discardDraftFrom(host: 'lan' | 'proxy'): void {
    draftOutcomeHost = host;
    controller?.discardDraft();
  }

  const dirty = $derived(
    snapshot ? hostNetworkChanged(snapshot, configSnapshot) : false,
  );

  const commitPlacement = $derived(
    networkDraftCommitPlacement({
      dirty,
      lanOpen,
      proxyOpen,
      httpDraftExpandersRendered: !tlsCutoverApplied,
    }),
  );

  const busy = $derived(
    Boolean(snapshot && networkIsBusy(snapshot.phase)) ||
      Boolean(controller?.isHostWriteInFlight()) ||
      Boolean(tlsSnapshot && tlsNetworkLocksHost(tlsSnapshot)),
  );

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

  const accessSummary = $derived(configSnapshot ? networkAccessSummary(configSnapshot, runtimeSnapshot, managerShell.runtimeError) : null);

  const overall = $derived(
    managerShell.runtimeError
      ? ({ text: 'Unbekannt', level: 'bad' } as const)
      : runtimeSnapshot
        ? deriveOverallStatus(runtimeSnapshot)
        : null,
  );

  const savedUrl = $derived(savedDeviceBaseUrl(configSnapshot));

  function syncTlsSnapshot(): void {
    tlsSnapshot = tlsController ? { ...tlsController.getState() } : null;
  }

  onMount(() => {
    controller = createNetworkController({
      api: requireApi(),
      getConfig: () => managerShell.configSnapshot,
      getRuntime: () => managerShell.runtimeSnapshot,
      onAfterMutation,
      requestConfirm,
      onStateChange: syncSnapshot,
      isPeerMutating: () => {
        const tls = tlsController?.getState();
        return Boolean(tls && tlsNetworkLocksHost(tls));
      },
    });
    tlsController = createTlsNetworkController({
      api: requireApi(),
      getConfig: () => managerShell.configSnapshot,
      lanIp: () =>
        resolvedLanIp(
          controller?.getState() ?? { lanAppIp: '', customLanIp: '' },
        ) ||
        effectiveConfiguredLanIp(managerShell.configSnapshot, managerShell.runtimeSnapshot),
      onAfterMutation,
      onStateChange: syncTlsSnapshot,
      requestConfirm,
      isPeerMutating: () => Boolean(controller?.isHostWriteInFlight()),
    });
    syncSnapshot();
    syncTlsSnapshot();
  });

  $effect(() => {
    const c = controller;
    const tls = tlsController;
    const session = managerShell.networkSession;
    const config = managerShell.configSnapshot;
    if (!c) {
      return;
    }

    if (!session) {
      if (lastSessionGeneration !== null) {
        c.hide();
        tls?.abandonSession();
        closeConfirm();
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
      applyExpanderDefaults(c.getState());
      void tls?.hydrateOperatorRequest();
      return;
    }

    // Same session: config refresh → controller decides hydrate vs keep dirty draft.
    if (config) {
      c.syncFromConfig();
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
    {#snippet draftCommitActions(host: 'lan' | 'proxy')}
      {#if warningText}
        <p class="hint">{warningText}</p>
      {/if}
      <div class="actions-row network-config-actions">
        <button
          type="button"
          class="btn-secondary"
          disabled={busy}
          onclick={() => applyDraftFrom(host)}
        >
          {NETWORK_APPLY_BUTTON_LABEL}
        </button>
        <button
          type="button"
          class="btn-secondary"
          disabled={busy}
          onclick={() => discardDraftFrom(host)}
        >
          {NETWORK_DISCARD_BUTTON_LABEL}
        </button>
      </div>
    {/snippet}
    {#snippet draftOutcome(host: 'lan' | 'proxy' | 'repair')}
      {#if draftOutcomeHost === host}
        {#if progressText}
          <p class="maintenance-backup-status" role="status">{progressText}</p>
        {:else if snapshot?.notice}
          <p
            role="status"
            class={snapshot.notice.tone === 'error'
              ? 'error'
              : snapshot.notice.tone === 'warning'
                ? 'lan-warning'
                : 'maintenance-backup-status'}
          >
            {snapshot.notice.message}
          </p>
        {/if}
      {/if}
    {/snippet}
    {#if overall && overall.level !== 'ok'}
      <p class={statusOverallNoticeClass(overall.level)} aria-live="polite">
        {overall.text}
      </p>
    {/if}
    <NetworkAccessSummary
      status={configSnapshot}
      runtime={runtimeSnapshot}
      runtimeError={managerShell.runtimeError}
    />
    {#if showProxyRestore}
      <section class="panel-section" aria-label="Zugriff wiederherstellen">
        <h2>Wiederherstellung des Zugangs</h2>
        <ProxyRecoveryAction
          disabled={busy || dirty || Boolean(managerShell.runtimeError)}
          onRestore={() => {
            draftOutcomeHost = 'repair';
            controller?.restoreProxy();
          }}
        />
        {#if dirty}
          <p class="hint">Übernehmen oder verwerfen Sie zuerst die Adressänderungen.</p>
        {/if}
        {@render draftOutcome('repair')}
      </section>
    {:else}
      {@render draftOutcome('repair')}
    {/if}
    <section class="panel-section panel-section--network">
      <div class="maintenance-accordion">
        <MaintenanceSection
          open={lanOpen}
          title="Praxisadresse dieses Rechners"
          subtitle={`${networkLanSubtitle(configSnapshot, snapshot)} · ${networkHostChecksSubtitle(hostChecks)}`}
          onToggle={() => {
            lanOpen = !lanOpen;
          }}
        >
          <p class="hint">
            Wählen Sie die IP-Adresse dieses Rechners, über die Ihre Praxisgeräte zugreifen sollen.
            Bei eingeschaltetem Proxy wird der Zugriff an diese Adresse gebunden. Ohne Proxy bleibt
            Port 8080 auf allen Netzwerkkarten erreichbar.
          </p>
          <LanIpPanel
            state={snapshot}
            network={snapshot.network}
            status={configSnapshot}
            disabled={busy}
            onChange={patchFields}
          />
          <DeviceAddressPreview
            address={tlsPreparationActive || tlsCutoverApplied ? savedUrl : draftCanonicalBaseUrl(snapshot, configSnapshot)}
            savedAddress={savedUrl}
            legacy={!tlsPreparationActive && !tlsCutoverApplied && Boolean(existingHttpHostname(configSnapshot))}
            disabled={busy}
            checking={snapshot.phase === 'checking'}
            canVerify={Boolean(compose?.running)}
            verifyHint={NETWORK_STACK_STOPPED_VERIFY_HINT}
            onVerify={() => {
              draftOutcomeHost = 'lan';
              controller?.verifyActiveConfiguration(savedUrl);
            }}
          />
          <h3 class="wizard-subheading">Prüfungen für Adresse und Ports</h3>
          <NetworkBindingChecks checks={hostChecks} />
          {#if commitPlacement.lan}
            {@render draftCommitActions('lan')}
          {/if}
          {@render draftOutcome('lan')}
        </MaintenanceSection>

        {#if !tlsCutoverApplied}
          <MaintenanceSection
            open={proxyOpen}
            title={NETWORK_PROXY_EXPANDER_TITLE}
            subtitle={networkProxySubtitle(configSnapshot, snapshot.proxyEnabled, runtimeSnapshot)}
            onToggle={() => {
              proxyOpen = !proxyOpen;
            }}
          >
            <ProxySettings
              enabled={snapshot.proxyEnabled}
              disabled={busy || tlsPreparationActive}
              onChange={(proxyEnabled) => patchFields({ proxyEnabled })}
            />
            {#if tlsPreparationActive}
              <p class="hint">
                Der Proxy bleibt während der HTTPS-Vorbereitung eingeschaltet. Um diese Auswahl zu ändern,
                verwerfen Sie zuerst die Vorbereitung im Abschnitt „HTTPS“.
              </p>
            {/if}
            {#if commitPlacement.proxy}
              {@render draftCommitActions('proxy')}
            {/if}
            {@render draftOutcome('proxy')}
          </MaintenanceSection>
        {/if}

        <!-- TLS actions never go through applyAndVerify() / POST /host/network. -->
        {#if tlsController && tlsSnapshot}
          <MaintenanceSection
            open={tlsOpen}
            title="HTTPS"
            subtitle={tlsNetworkSubtitle(configSnapshot.tls, tlsSnapshot.pendingObtain)}
            onToggle={() => {
              tlsOpen = !tlsOpen;
            }}
          >
            <TlsNetworkPanel
              status={configSnapshot}
              network={snapshot.network}
              lanIp={diagramLanIp}
              state={tlsSnapshot}
              controller={tlsController}
              busy={busy}
              onOpenMail={(href) => void requireApi().openExternalUrl(href)}
            />
          </MaintenanceSection>
        {/if}
      </div>

      <div class="maintenance-accordion network-diagnose-accordion">
        <MaintenanceSection
          open={topologyOpen}
          title="Erläuterung zum Netz"
          subtitle="Verbindungsweg und Hinweise für die Praxis-IT"
          onToggle={() => {
            topologyOpen = !topologyOpen;
          }}
        >
          <NetworkTopologyDiagram labels={{
            lanIp: configSnapshot.network.configuredLanIp,
            proxyEnabled: configSnapshot.proxy.enabled,
            httpsEnabled: Boolean(configSnapshot.tls?.cutoverApplied),
            baseUrl: savedUrl,
            operation: accessSummary?.operation,
            diagnosis: accessSummary?.diagnosis,
          }} />
        </MaintenanceSection>
      </div>
    </section>
  {/if}

  <ConfirmDialog open={confirmOpen} onConfirm={confirmAndRun} onCancel={closeConfirm}>
    <p>{confirmMessage}</p>
  </ConfirmDialog>
</div>
