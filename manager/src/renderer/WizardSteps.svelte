<script lang="ts">
  import { dockerPrerequisitesHints } from '../shared/docker-prerequisites-ui.js';
  import {
    DOCKER_FILE_SHARING_HINT,
    needsDockerFileSharingHint,
  } from '../shared/docker-file-sharing-hint.js';
  import {
    dockerReady,
    wizardProbeFailureHint,
  } from './wizard-flow.js';
  import { deliveryImagesReady, needsDeliveryImages } from './delivery-images-flow.js';
  import {
    ROUTING_MODE_WIZARD_INTRO_DETAIL,
    ROUTING_MODE_WIZARD_INTRO_LEAD,
  } from './routing-mode-ui.js';
  import { resolvedLanIp } from './wizard-state.js';
  import type { WizardController } from './wizard-controller.js';
  import type { WizardControllerState } from './wizard-controller.js';
  import {
    wizardApplyResultItems,
    wizardCheckMark,
    wizardCompletionLeadText,
    wizardStepTitle,
  } from './wizard-view-model.js';
  import FolderPathField from './FolderPathField.svelte';
  import LanIpPanel from './LanIpPanel.svelte';
  import GatewayPanel from './GatewayPanel.svelte';
  import WizardRoutingModePanel from './WizardRoutingModePanel.svelte';

  let {
    snapshot,
    controller,
    hostPlatform,
    onPatch,
  }: {
    snapshot: WizardControllerState;
    controller: WizardController;
    hostPlatform: string;
    onPatch: () => void;
  } = $props();

  function patchFields(patch: Parameters<WizardController['patchFields']>[0]): void {
    controller.patchFields(patch);
    onPatch();
  }
</script>

<div id="wizard-content">
  <div class="wizard-panel">
    <h2>{wizardStepTitle(snapshot.step)}</h2>

    {#if snapshot.step === 1}
      {#if !snapshot.status}
        <p>Status wird geladen …</p>
      {:else}
        <ul class="checklist">
          <li class={snapshot.status.docker.installed ? 'is-done' : 'is-open'}>
            <span class="checklist-mark">{snapshot.status.docker.installed ? '✓' : '○'}</span>
            <span>Docker installiert</span>
          </li>
          <li class={snapshot.status.docker.daemonRunning ? 'is-done' : 'is-open'}>
            <span class="checklist-mark">{snapshot.status.docker.daemonRunning ? '✓' : '○'}</span>
            <span>Docker-Daemon läuft</span>
          </li>
          <li class={snapshot.status.docker.composeAvailable ? 'is-done' : 'is-open'}>
            <span class="checklist-mark">{snapshot.status.docker.composeAvailable ? '✓' : '○'}</span>
            <span>docker compose verfügbar</span>
          </li>
          {#if snapshot.status.deliveryImages.required}
            <li class={deliveryImagesReady(snapshot.status) ? 'is-done' : 'is-open'}>
              <span class="checklist-mark">{deliveryImagesReady(snapshot.status) ? '✓' : '○'}</span>
              <span>Software-Paket (app + sandbox)</span>
            </li>
          {/if}
        </ul>

        {#if !dockerReady(snapshot.status)}
          {@const hints = dockerPrerequisitesHints(snapshot.status.docker, hostPlatform)}
          {#each hints.hints as hint (hint)}
            <p class="hint">{hint}</p>
          {/each}
          {#if hints.installLink}
            <button
              type="button"
              class="btn-secondary wizard-install-link"
              disabled={snapshot.busy}
              onclick={() => {
                void window.praxisManager?.openExternalUrl(hints.installLink!.url);
              }}
            >
              {hints.installLink.buttonLabel}
            </button>
          {/if}
          <button
            type="button"
            class="btn-secondary wizard-install-link"
            disabled={snapshot.busy}
            onclick={() => {
              void controller.refreshPrerequisites().then(onPatch);
            }}
          >
            {snapshot.busy ? 'Prüfe …' : 'Erneut prüfen'}
          </button>
        {:else if needsDeliveryImages(snapshot.status)}
          <p class="hint">
            Release-Paket aus Ihrer Praxis-Flow-Freigabe wählen (eine .tar.gz-Datei mit app- und
            sandbox-Image). manifest.json oder SHA256SUMS.txt muss im selben Ordner liegen — SHA256
            wird vor dem Import geprüft.
          </p>
          <button
            type="button"
            class="btn-secondary wizard-install-link"
            disabled={snapshot.busy}
            onclick={() => {
              void controller.loadReleaseArchive().then(onPatch);
            }}
          >
            {snapshot.busy ? 'Import läuft …' : 'Release-Paket wählen …'}
          </button>
        {/if}

        {#if snapshot.releaseImportStatus && snapshot.busy}
          <p class="wizard-progress is-active" role="status">
            <span class="spinner" aria-hidden="true"></span>
            {snapshot.releaseImportStatus}
          </p>
        {/if}
      {/if}
    {:else if snapshot.step === 2}
      <p>
        Die App lauscht auf allen Interfaces (Port 8080). Hier legen Sie fest, unter welcher
        Host-Adresse Terminal, TV und MFA die app im Praxis-LAN/-WLAN erreichen — nicht localhost.
      </p>
      <LanIpPanel
        state={snapshot}
        network={snapshot.network}
        status={snapshot.status}
        disabled={snapshot.busy}
        variant="wizard"
        radioName="wizard-lan-ip"
        idPrefix="wizard"
        onChange={patchFields}
      />
    {:else if snapshot.step === 3}
      <p>
        Dieser Name wird an verschiedenen Stellen in Praxis Flow verwendet, um den Namen Ihrer
        Praxis anzuzeigen.
      </p>
      {#if snapshot.status?.envExists && snapshot.practiceDisplayName.trim()}
        <p class="hint">Aktueller Wert aus .env: {snapshot.practiceDisplayName.trim()}</p>
      {/if}
      <input
        type="text"
        class="wizard-input"
        value={snapshot.practiceDisplayName}
        disabled={snapshot.busy}
        oninput={(event) => patchFields({ practiceDisplayName: event.currentTarget.value })}
      />

      <h3 class="routing-mode-subheading">Routing-Modus</h3>
      <div class="routing-mode-intro">
        <p><strong>{ROUTING_MODE_WIZARD_INTRO_LEAD}</strong></p>
        <p>{ROUTING_MODE_WIZARD_INTRO_DETAIL}</p>
      </div>
      <WizardRoutingModePanel
        routingMode={snapshot.routingMode}
        complexRoutingLicensed={snapshot.complexRoutingLicensed}
        busy={snapshot.busy || snapshot.routingCapabilitiesStatus !== 'ready'}
        onChange={(routingMode) => patchFields({ routingMode })}
      />
      {#if snapshot.routingCapabilitiesStatus === 'loading'}
        <p class="wizard-progress is-active" role="status">
          <span class="spinner" aria-hidden="true"></span>
          Routing-Modus wird geladen …
        </p>
      {/if}
    {:else if snapshot.step === 4}
      <GatewayPanel
        state={snapshot}
        network={snapshot.network}
        lanIpFallback={resolvedLanIp(snapshot)}
        disabled={snapshot.busy}
        showIntro
        radioName="wizard-gateway-interface"
        idPrefix="wizard"
        onChange={patchFields}
      />
      {#if snapshot.status?.gateway?.enabled && snapshot.status.envExists}
        <p class="hint">Bestehende Gast-WLAN-Einstellungen aus der Konfiguration übernommen.</p>
      {/if}
    {:else if snapshot.step === 5}
      <p>
        Diese Ordner werden per Docker-Bind-Mount mit /imports und /exports im app-Container
        verbunden — für Kontakt-CSV und MFA-Exporte.
      </p>
      {#if needsDockerFileSharingHint(hostPlatform)}
        <p class="hint">{DOCKER_FILE_SHARING_HINT}</p>
      {/if}
      {#if snapshot.status?.envExists}
        <p class="hint">
          Aktuelle Pfade aus .env sind vorausgefüllt. Beim Anwenden werden sie in die Konfiguration
          übernommen.
        </p>
      {/if}
      <FolderPathField
        label="Importordner (Kontakte, CSV)"
        value={snapshot.importsHostPath}
        disabled={snapshot.busy}
        onChange={(value) => patchFields({ importsHostPath: value })}
        onBrowse={async () => {
          const path = await controller.browseImportsFolder();
          onPatch();
          return path;
        }}
      />
      <FolderPathField
        label="Exportordner (Dokumente aus MFA)"
        value={snapshot.exportsHostPath}
        disabled={snapshot.busy}
        onChange={(value) => patchFields({ exportsHostPath: value })}
        onBrowse={async () => {
          const path = await controller.browseExportsFolder();
          onPatch();
          return path;
        }}
      />
    {:else if snapshot.step === 6}
      {#if !snapshot.plan}
        <p>Plan wird geladen …</p>
      {:else}
        <dl class="status-grid wizard-summary-grid">
          <dt>Terminal</dt><dd>{snapshot.plan.deviceUrls.terminal}</dd>
          <dt>TV</dt><dd>{snapshot.plan.deviceUrls.tv}</dd>
          <dt>MFA</dt><dd>{snapshot.plan.deviceUrls.mfa}</dd>
          <dt>Portal</dt><dd>{snapshot.plan.deviceUrls.portal}</dd>
          <dt>Ops Setup</dt><dd>{snapshot.plan.deviceUrls.opsSetup}</dd>
        </dl>

        {#if snapshot.gatewayEnabled && Object.keys(snapshot.plan.gatewayEnv).length > 0}
          <h3 class="wizard-subheading">Gast-WLAN (Gateway)</h3>
          <dl class="status-grid wizard-summary-grid">
            <dt>Interface</dt><dd>{snapshot.plan.gatewayEnv.GATEWAY_INTERFACE ?? snapshot.gatewayInterface}</dd>
            <dt>Gateway-IP</dt><dd>{snapshot.plan.gatewayEnv.GATEWAY_IP ?? snapshot.gatewayIp}</dd>
            <dt>Portal-URL</dt><dd>{snapshot.plan.gatewayEnv.APP_PORTAL_URL ?? ''}</dd>
            <dt>App-API für Gateway</dt><dd>{snapshot.plan.gatewayEnv.APP_API_URL ?? ''}</dd>
            <dt>Gateway-Bridge für app</dt><dd>{snapshot.plan.gatewayEnv.GATEWAY_AUTH_BRIDGE_URL ?? ''}</dd>
          </dl>
        {/if}

        <h3 class="wizard-subheading">Host-Ordner (Docker-Mounts)</h3>
        <dl class="status-grid wizard-summary-grid">
          <dt>Import</dt><dd>{snapshot.importsHostPath.trim()}</dd>
          <dt>Export</dt><dd>{snapshot.exportsHostPath.trim()}</dd>
        </dl>
      {/if}
    {:else if snapshot.step === 7}
      {#if !snapshot.applyResult}
        <p>
          Der Manager schreibt die technische Compose-Konfiguration, legt die Host-Ordner an und
          startet den lokalen Stack.
        </p>
        {#if snapshot.status?.envExists}
          <p class="hint">
            Bestehende technische Werte werden übernommen, soweit sie gültig sind.
            Platzhalter-Secrets werden ersetzt; Staff-PINs liegen in der Datenbank und werden nicht
            überschrieben.
          </p>
        {/if}
      {:else}
        <h3 class="wizard-subheading">Anwenden</h3>
        <ul class="checklist">
          {#each wizardApplyResultItems(snapshot.applyResult) as item (item)}
            <li>{item}</li>
          {/each}
        </ul>
        {#if !snapshot.applyResult.compose?.ok && snapshot.applyResult.compose?.detail}
          <p class="hint">{snapshot.applyResult.compose.detail}</p>
        {/if}

        <h3 class="wizard-subheading">Prüfen</h3>
        {#if snapshot.probeStatusText}
          <p class="wizard-progress is-active" role="status">
            <span class="spinner" aria-hidden="true"></span>
            {snapshot.probeStatusText}
          </p>
        {:else if snapshot.status}
          <ul class="checklist">
            {#each snapshot.status.probes as probe (probe.id)}
              <li>{wizardCheckMark(probe.ok)} {probe.message}</li>
            {/each}
          </ul>
          {@const failureHint = wizardProbeFailureHint(snapshot.status.probes)}
          {#if failureHint}
            <p class="hint">{failureHint}</p>
          {/if}
        {:else}
          <p>Probes werden geladen …</p>
        {/if}

        <p>{wizardCompletionLeadText(snapshot)}</p>
        <p class="hint">
          MFA-, Ops- und Panel-PIN: Standard 0000 — MFA/Panel in MFA → Betrieb, Ops in System → PIN
          &amp; Sicherheit. Vergessene MFA- oder Ops-PIN: Manager → Wartung.
        </p>
      {/if}
    {/if}
  </div>
</div>
