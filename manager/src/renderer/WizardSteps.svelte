<script lang="ts">
  import { dockerPrerequisitesHints } from '../shared/docker-prerequisites-ui.js';
  import {
    DOCKER_FILE_SHARING_HINT,
    needsDockerFileSharingHint,
  } from '../shared/docker-file-sharing-hint.js';
  import {
    dockerReady,
    networkPrerequisitesFailed,
    networkPrerequisitesReady,
    wizardHttpsPrepared,
    wizardProbeFailureHint,
  } from './wizard-flow.js';
  import { deliveryImagesReady, needsDeliveryImages } from './delivery-images-flow.js';
  import {
    ROUTING_MODE_WIZARD_HEADING,
    ROUTING_MODE_WIZARD_INTRO_DETAIL,
  } from './routing-mode-ui.js';
  import type { WizardController } from './wizard-controller.js';
  import type { WizardControllerState } from './wizard-controller.js';
  import {
    wizardApplyResultItems,
    wizardCheckMark,
    wizardCompletionLeadText,
    wizardHttpsDnsWaitCopy,
    wizardStepTitle,
  } from './wizard-view-model.js';
  import FolderPathField from './FolderPathField.svelte';
  import LanIpPanel from './LanIpPanel.svelte';
  import ProxySettings from './ProxySettings.svelte';
  import ReachabilityPanel from './ReachabilityPanel.svelte';
  import WizardRoutingModePanel from './WizardRoutingModePanel.svelte';
  import WizardHttpsPanel from './WizardHttpsPanel.svelte';

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
            <span>Docker Compose verfügbar</span>
          </li>
          <li class={networkPrerequisitesReady(snapshot.status) ? 'is-done' : 'is-open'}>
            <span class="checklist-mark"
              >{networkPrerequisitesReady(snapshot.status) ? '✓' : '○'}</span
            >
            <span>Netzwerkvoraussetzungen prüfen / ok</span>
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
        {:else if !networkPrerequisitesReady(snapshot.status)}
          {#if networkPrerequisitesFailed(snapshot.status).length > 0}
            {#each networkPrerequisitesFailed(snapshot.status) as check (check.id)}
              <p class="hint">{check.message}</p>
              {#if check.detail}
                <p class="hint">{check.detail}</p>
              {/if}
            {/each}
          {:else}
            <p class="hint">Netzwerkvoraussetzungen konnten noch nicht geprüft werden.</p>
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
      <p class="wizard-step-lead">
        Wie sollen Patienten durch die Praxis geführt werden? Praxisname und Kontaktdaten legt die
        Praxis später im Ops-Assistenten fest.
      </p>
      <h3 class="routing-mode-subheading">{ROUTING_MODE_WIZARD_HEADING}</h3>
      <p class="hint routing-mode-intro-compact">{ROUTING_MODE_WIZARD_INTRO_DETAIL}</p>
      <WizardRoutingModePanel
        routingMode={snapshot.routingMode}
        complexRoutingLicensed={snapshot.complexRoutingLicensed}
        busy={snapshot.busy || snapshot.routingCapabilitiesStatus !== 'ready'}
        onChange={(routingMode) => patchFields({ routingMode })}
      />
      {#if snapshot.routingCapabilitiesStatus === 'loading'}
        <p class="wizard-progress is-active" role="status">
          <span class="spinner" aria-hidden="true"></span>
          Routing wird geladen …
        </p>
      {/if}
    {:else if snapshot.step === 3}
      <p class="wizard-step-lead">
        Ordner für Kontakt-Import und Dokument-Export auf diesem Rechner.
      </p>
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
    {:else if snapshot.step === 4}
      <p class="wizard-step-lead">
        Unter welcher Adresse — optional mit internem DNS-Namen — soll Praxis Flow erreichbar sein?
      </p>

      <section class="network-config-block">
        <h3 class="network-config-subheading">1. Host im Praxisnetz</h3>
        <p class="hint">
          Adresse dieses Rechners — Fallback, wenn ein Hostname im LAN nicht auflöst.
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
      </section>

      <section class="network-config-block">
        <h3 class="network-config-subheading">2. Geräte-URL (Basis)</h3>
        <ReachabilityPanel
          state={snapshot}
          network={snapshot.network}
          disabled={snapshot.busy}
          onChange={patchFields}
        />
      </section>
    {:else if snapshot.step === 5}
      <p class="wizard-step-lead">
        Optionaler Zugang: Reverse Proxy und später die WLAN-/Captive-Anbindung fürs Patientenportal.
      </p>

      <section class="network-config-block">
        <h3 class="network-config-subheading">Browserzugriff (Port 80)</h3>
        <ProxySettings
          enabled={snapshot.proxyEnabled}
          disabled={snapshot.busy || wizardHttpsPrepared(snapshot.status)}
          onChange={(proxyEnabled) => patchFields({ proxyEnabled })}
        />
        {#if wizardHttpsPrepared(snapshot.status)}
          <p class="hint">Port 80 bleibt während der HTTPS-Vorbereitung unverändert.</p>
        {/if}
      </section>

      <section class="network-config-block">
        <h3 class="network-config-subheading">Patientenportal / WLAN-Freigabe</h3>
        <p class="hint">
          Hier kommt später die Auswahl des WLAN-Adapters (z. B. Omada, UniFi): Praxis Flow prüft die
          Wartenummer und meldet dem Captive der Praxis-IT die Freigabe. Router und Captive Portal
          stellen wir nicht her.
        </p>
        <p class="hint">
          Bis dahin: Captive bleibt bei der Praxis-IT. Produktiv mit Patientenportal empfohlen;
          <code>/portal</code> ohne Captive nur zum Test. Details unter Netzwerk → Erläuterung zum
          Netz.
        </p>
        <p class="hint wizard-placeholder-note">
          <strong>Auswahl folgt:</strong> Vendor-Dropdown und Anschlussdaten — noch nicht verfügbar.
        </p>
      </section>
    {:else if snapshot.step === 6}
      <WizardHttpsPanel {snapshot} {controller} {onPatch} />
    {:else if snapshot.step === 7}
      {#if !snapshot.plan}
        <p>Plan wird geladen …</p>
      {:else}
        <p class="wizard-step-lead">
          {#if wizardHttpsPrepared(snapshot.status)}
            Vorläufig über die IP, bis HTTPS steht.
          {:else if snapshot.proxyEnabled}
            Einrichtung über die IP. HTTPS später unter Netzwerk.
          {:else}
            Einrichtung über Port 8080. HTTPS erst, wenn der Proxy an ist.
          {/if}
        </p>
        <dl class="status-grid wizard-summary-grid">
          <dt>Terminal</dt><dd>{snapshot.plan.deviceUrls.terminal}</dd>
          <dt>TV</dt><dd>{snapshot.plan.deviceUrls.tv}</dd>
          <dt>MFA</dt><dd>{snapshot.plan.deviceUrls.mfa}</dd>
          <dt>Portal</dt><dd>{snapshot.plan.deviceUrls.portal}</dd>
          <dt>Ops Setup</dt><dd>{snapshot.plan.deviceUrls.opsSetup}</dd>
        </dl>
        {#if wizardHttpsPrepared(snapshot.status)}
          <p class="notice is-warn">
            Geplante HTTPS-Adresse (noch nicht nutzbar):
            <code>https://{snapshot.status?.tls?.hostname ?? '…'}</code>. Bis dahin über die IP. HTTPS
            später unter Netzwerk.
          </p>
        {:else if snapshot.proxyEnabled}
          <p class="notice is-warn">
            HTTPS ist nicht vorbereitet. Weitere Einrichtung jetzt über die IP. Später unter
            Netzwerk.
          </p>
        {:else}
          <p class="notice is-warn">
            Ohne Proxy steht HTTPS später nicht zur Verfügung. Proxy und HTTPS können später
            nachträglich im Tab Netzwerk dieser Manager-App eingerichtet werden.
          </p>
        {/if}
        <p class="hint">
          {#if snapshot.proxyEnabled}
            Geräte-URLs nutzen den Reverse Proxy (Port 80). Der App-Port bleibt lokal unter
            <code>127.0.0.1:8080</code> erreichbar.
          {:else}
            Geräte nutzen Port 8080. Optionalen Proxy können Sie unter Zugang oder später unter
            Netzwerk aktivieren.
          {/if}
        </p>

        <h3 class="wizard-subheading">Host-Ordner (Docker-Mounts)</h3>
        <dl class="status-grid wizard-summary-grid">
          <dt>Import</dt><dd>{snapshot.importsHostPath.trim()}</dd>
          <dt>Export</dt><dd>{snapshot.exportsHostPath.trim()}</dd>
        </dl>
      {/if}
    {:else if snapshot.step === 8}
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
        {#if wizardHttpsPrepared(snapshot.status)}
          <p class="hint">HTTPS später unter Netzwerk. {wizardHttpsDnsWaitCopy(snapshot.status?.tls?.mode)}</p>
        {:else if snapshot.proxyEnabled}
          <p class="hint">HTTPS später unter Netzwerk.</p>
        {/if}
        <p class="hint">
          MFA-, Ops- und Panel-PIN: Standard 0000 — MFA/Panel in MFA → Betrieb, Ops in System → PIN
          &amp; Sicherheit. Vergessene MFA- oder Ops-PIN: Manager → Wartung.
        </p>
      {/if}
    {/if}
  </div>
</div>
