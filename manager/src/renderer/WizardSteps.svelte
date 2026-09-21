<script lang="ts">
  import { dockerPrerequisitesHints } from '../shared/docker-prerequisites-ui.js';
  import {
    DOCKER_FILE_SHARING_HINT,
    needsDockerFileSharingHint,
  } from '../shared/docker-file-sharing-hint.js';
  import {
    dockerReady,
    wizardHttpsPrepared,
    wizardUsesExistingTlsConfiguration,
    wizardProbeFailureHint,
  } from './wizard-flow.js';
  import { deliveryImagesReady, needsDeliveryImages } from './delivery-images-flow.js';
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
  import DeviceAddressPreview from './DeviceAddressPreview.svelte';
  import { draftCanonicalBaseUrl, existingHttpHostname } from './reachability.js';
  import { resolvedLanIp } from './wizard-state.js';
  import WizardHttpsPanel from './WizardHttpsPanel.svelte';

  let {
    snapshot,
    controller,
    hostPlatform,
  }: {
    snapshot: WizardControllerState;
    controller: WizardController;
    hostPlatform: string;
  } = $props();

  function patchFields(patch: Parameters<WizardController['patchFields']>[0]): void {
    controller.patchFields(patch);
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
              void controller.refreshPrerequisites();
            }}
          >
            {snapshot.busy ? 'Prüfe …' : 'Erneut prüfen'}
          </button>
        {:else if needsDeliveryImages(snapshot.status)}
          <p class="hint">
            Wählen Sie für die Erstinstallation eine .pfinstall-Datei. Dateien mit der Endung
            .pfupdate sind für spätere Updates bestimmt.
          </p>
          <button
            type="button"
            class="btn-secondary wizard-install-link"
            disabled={snapshot.busy}
            onclick={() => {
              void controller.loadReleaseArchive();
            }}
          >
            {snapshot.busy ? 'Import läuft …' : 'Installationsdatei wählen …'}
          </button>
        {/if}

        {#if snapshot.releaseImportStatus && snapshot.busy}
          <p class="wizard-progress is-active" role="status">
            <span class="spinner" aria-hidden="true"></span>
            {snapshot.releaseImportStatus}
          </p>
        {/if}
      {/if}
    {:else if snapshot.step === 3}
      <p class="wizard-step-lead">
        Ordner für Kontakt-Import und Dokument-Export auf diesem Rechner.
      </p>
      <p>
        Praxis Flow liest Kontaktdateien aus dem Importordner und legt Dokumente aus MFA
        im Exportordner ab.
      </p>
      {#if needsDockerFileSharingHint(hostPlatform)}
        <p class="hint">{DOCKER_FILE_SHARING_HINT}</p>
      {/if}
      {#if snapshot.status?.envExists}
        <p class="hint">
          Die gespeicherten Ordner sind vorausgefüllt. Beim Anwenden werden sie in die Konfiguration
          übernommen.
        </p>
      {/if}
      <FolderPathField
        label="Importordner (Kontakte, CSV)"
        value={snapshot.importsHostPath}
        disabled={snapshot.busy}
        onChange={(value) => patchFields({ importsHostPath: value })}
        onBrowse={async () => {
          return controller.browseImportsFolder();
        }}
      />
      <FolderPathField
        label="Exportordner (Dokumente aus MFA)"
        value={snapshot.exportsHostPath}
        disabled={snapshot.busy}
        onChange={(value) => patchFields({ exportsHostPath: value })}
        onBrowse={async () => {
          return controller.browseExportsFolder();
        }}
      />
    {:else if snapshot.step === 5}
      <p class="wizard-step-lead">
        Wählen Sie den Zugang für den internen Praxisbetrieb. HTTPS kann anschließend oder später eingerichtet werden.
      </p>

      <section class="network-config-block">
        <ProxySettings
          enabled={snapshot.proxyEnabled}
          disabled={snapshot.busy || wizardHttpsPrepared(snapshot.status)}
          onChange={(proxyEnabled) => patchFields({ proxyEnabled })}
        />
        {#if snapshot.proxyEnabled}
          <div class="network-address-choice">
            <h3 class="network-config-subheading">Adresse für den Praxiszugang</h3>
            <p class="hint">Der Proxy wird beim Anwenden an diese IP-Adresse gebunden.</p>
            <LanIpPanel state={snapshot} network={snapshot.network} status={snapshot.status}
              disabled={snapshot.busy} variant="wizard" radioName="wizard-lan-ip"
              idPrefix="wizard" onChange={patchFields} />
          </div>
        {:else}
          <details class="network-address-choice" open={snapshot.lanAppIp === '__custom__' || !resolvedLanIp(snapshot)}>
            <summary>Adresse für Geräte-Links ändern</summary>
            <p class="hint">Die Auswahl bestimmt die angezeigten Geräte-Links und die Erreichbarkeitsprüfung. Sie schränkt den Zugriff über andere Netzwerkanschlüsse nicht ein.</p>
            <LanIpPanel state={snapshot} network={snapshot.network} status={snapshot.status}
              disabled={snapshot.busy} variant="wizard" radioName="wizard-lan-ip"
              idPrefix="wizard" onChange={patchFields} />
          </details>
        {/if}
        {#if !wizardHttpsPrepared(snapshot.status)}
          <DeviceAddressPreview
            address={draftCanonicalBaseUrl(snapshot, snapshot.status)}
            legacy={Boolean(existingHttpHostname(snapshot.status))}
          />
        {/if}
        {#if wizardHttpsPrepared(snapshot.status)}
          <p class="hint">Port 80 bleibt während der HTTPS-Vorbereitung unverändert.</p>
        {/if}
      </section>

    {:else if snapshot.step === 6}
      <WizardHttpsPanel {snapshot} {controller} />
    {:else if snapshot.step === 7}
      {#if wizardUsesExistingTlsConfiguration(snapshot.status)}
        <p class="wizard-step-lead">Praxis Flow ist auf diesem Rechner bereits mit HTTPS eingerichtet.</p>
        <p class="notice">
          Die bestehende Host- und TLS-Konfiguration bleibt unverändert. Änderungen daran nehmen Sie
          gezielt im Tab Netzwerk vor.
        </p>
        {#if snapshot.status?.deviceUrls}
          <dl class="status-grid wizard-summary-grid">
            <dt>Terminal</dt><dd>{snapshot.status.deviceUrls.terminal}</dd>
            <dt>TV</dt><dd>{snapshot.status.deviceUrls.tv}</dd>
            <dt>MFA</dt><dd>{snapshot.status.deviceUrls.mfa}</dd>
            <dt>Portal – intern</dt><dd>{snapshot.status.deviceUrls.portal}</dd>
            <dt>Ops Setup</dt><dd>{snapshot.status.deviceUrls.opsSetup}</dd>
          </dl>
        {/if}
      {:else if !snapshot.plan}
        <p>Plan wird geladen …</p>
      {:else}
        <p class="wizard-step-lead">
          {#if wizardHttpsPrepared(snapshot.status)}
            Vorläufig über die IP, bis HTTPS steht.
          {:else if snapshot.proxyEnabled}
            Interner Zugriff über die ausgewählte Praxisadresse. HTTPS kann später eingerichtet werden.
          {:else}
            Initialer Betriebsmodus: interner Zugriff über HTTP auf Port 8080.
          {/if}
        </p>
        <p class="hint">MFA, Terminal, TV und Portal sind für die interne Nutzung vorgesehen. Ein separater Patientenzugang ist noch nicht eingerichtet.</p>
        <dl class="status-grid wizard-summary-grid">
          <dt>Terminal</dt><dd>{snapshot.plan.deviceUrls.terminal}</dd>
          <dt>TV</dt><dd>{snapshot.plan.deviceUrls.tv}</dd>
          <dt>MFA</dt><dd>{snapshot.plan.deviceUrls.mfa}</dd>
          <dt>Portal – intern</dt><dd>{snapshot.plan.deviceUrls.portal}</dd>
          <dt>Ops Setup</dt><dd>{snapshot.plan.deviceUrls.opsSetup}</dd>
        </dl>
        {#if wizardHttpsPrepared(snapshot.status)}
          <p class="notice is-warn">
            Geplante HTTPS-Adresse (noch nicht nutzbar):
            <code>https://{snapshot.status?.tls?.hostname ?? '…'}</code>. Bis dahin über die IP. HTTPS
            später unter Netzwerk.
          </p>
        {:else if snapshot.proxyEnabled}
          <p class="hint">
            HTTPS ist noch nicht eingerichtet. Weitere Einrichtung jetzt über die IP. Später unter
            Netzwerk.
          </p>
        {:else}
          <p class="hint">
            Vorgesehen ist der interne HTTP-Betrieb.
            HTTPS können Sie später unter Netzwerk einrichten.
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

        <h3 class="wizard-subheading">Import- und Exportordner</h3>
        <dl class="status-grid wizard-summary-grid">
          <dt>Import</dt><dd>{snapshot.importsHostPath.trim()}</dd>
          <dt>Export</dt><dd>{snapshot.exportsHostPath.trim()}</dd>
        </dl>
      {/if}
    {:else if snapshot.step === 8}
      {#if wizardUsesExistingTlsConfiguration(snapshot.status)}
        <h3 class="wizard-subheading">Einrichtung bereits abgeschlossen</h3>
        <p>
          Die aktive HTTPS-Konfiguration wurde erkannt und nicht erneut geschrieben. Praxis Flow
          kann mit den bestehenden Einstellungen weiterverwendet werden.
        </p>
      {:else if !snapshot.applyResult}
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

<style>
  .network-address-choice { margin-top: 1rem; }
  .network-address-choice summary { cursor: pointer; margin-bottom: 0.75rem; }
</style>
