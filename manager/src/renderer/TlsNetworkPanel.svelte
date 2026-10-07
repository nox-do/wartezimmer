<script lang="ts">
  import { tlsNetworkPendingObtain, tlsNetworkError } from './tls-network-controller.js';
  import { hasBlockingMaintenanceOperation } from '@wartezimmer/server-shared/manager-status-projection';
  import { managerShell } from './manager-shell-state.svelte.js';
  import { managerStatusViewModel } from './manager-status-view-model.js';
  import type { HostStatus, NetworkSnapshot, TlsOperatorRequest, TlsStatus } from '../shared/host-status.js';
  import type { TlsNetworkController, TlsNetworkState } from './tls-network-controller.js';
  import {
    TLS_OPERATOR_MAIL,
    TLS_OPERATOR_ZONE,
    mailtoHref,
    operatorMailSubject,
    operatorZoneMailBody,
    practiceDnsBody,
    tlsUsesOperatorDns,
    tlsPrepareHostname,
    tlsNameValid,
  } from './tls-identity.js';
  import {
    TLS_CUTOVER_CONFIRM_MESSAGE,
    TLS_LEASE_STALE_LAN_COPY,
    formatCertNotAfter,
    tlsCanApply,
    tlsCanObtain,
    tlsCanRenew,
    tlsCanRepair,
    tlsCanResetBeforeCutover,
    tlsCanVerifyDns,
    tlsDiagnoseItems,
    tlsDnsWaitCopy,
    tlsErrorCopy,
    tlsExpiryKind,
    tlsHttpsEligible,
    tlsIsApplyFail,
    tlsIsOff,
    tlsIsPersistedFailBeforeCutover,
    tlsLeaseBlockedByStaleLan,
    tlsLocalCheckItems,
    tlsNetworkShowsGenericErrorFooter,
    tlsShowsDnsWaitCopy,
    tlsShowsObtainWait,
    tlsShowsStructuredLastErrorNotice,
  } from './tls-network-view-model.js';
  import {
    NETWORK_PROXY_EXPANDER_TITLE,
  } from './network-view-model.js';

  let {
    status,
    network,
    lanIp,
    state,
    controller,
    busy,
    onOpenMail,
  }: {
    status: HostStatus;
    network: NetworkSnapshot | null;
    lanIp: string | null;
    state: TlsNetworkState;
    controller: TlsNetworkController;
    busy: boolean;
    onOpenMail: (href: string) => void;
  } = $props();

  const tls = $derived(status.tls);
  const proxyOn = $derived(Boolean(status.proxy?.enabled));
  const eligible = $derived(tlsHttpsEligible(proxyOn));
  const staleLan = $derived(tlsLeaseBlockedByStaleLan(status.network.lanIpStale));
  const starting = $derived(tlsIsOff(tls) && state.startPhase !== 'offer');
  const candidate = $derived(
    (network?.lanCandidates ?? []).find((item) => item.address === lanIp) ??
      status.network.currentLanCandidates.find((item) => item.address === lanIp) ??
      null,
  );
  const ownDns = $derived(Boolean(tls?.hostname && !tlsUsesOperatorDns(tls.hostname)));
  const dnsBody = $derived(tls?.hostname && lanIp ? practiceDnsBody({ ...tls, hostname: tls.hostname, lanIp }) : '');
  const draftDomain = $derived(tlsPrepareHostname(state) || '…');
  const mail = $derived(mailModel(tls, state.operatorRequest, lanIp));

  function mailModel(
    current: TlsStatus | undefined,
    operator: TlsOperatorRequest | null,
    ip: string | null,
  ): { body: string; href: string } | null {
    const hostname = current?.staffHostname || current?.hostname;
    const installationId = operator?.installationId || current?.installationId;
    if (!hostname || !installationId || !ip) {
      return null;
    }
    const ipChanged = Boolean(operator?.aRecord.value && operator.aRecord.value !== ip);
    const tokenConsumed = Boolean(current?.tokenConsumed) || ipChanged;
    const token = tokenConsumed ? null : operator?.oneTimeToken;
    const cname = operator?.acmeCname.value || current?.acmeCnameTarget;
    const body = operatorZoneMailBody({
      hostname,
      installationDomain: operator?.installationDomain || current?.installationDomain,
      staffHostname: operator?.staffHostname || current?.staffHostname || hostname,
      portalHostname: operator?.portalHostname || current?.portalHostname,
      wildcardCertificateName:
        operator?.wildcardCertificateName || current?.wildcardCertificateName,
      acmeCnameName: operator?.acmeCname.name,
      lanIp: ip,
      installationId,
      token,
      tokenConsumed,
      acmeCnameTarget: cname ?? null,
    });
    return {
      body,
      href: mailtoHref(TLS_OPERATOR_MAIL, operatorMailSubject(hostname), body),
    };
  }
</script>

{#if hasBlockingMaintenanceOperation(status)}
  <p class="hint" role="status">{managerStatusViewModel(status, managerShell.runtimeObservation).primary.summary}</p>
  <p class="hint">Hoständerungen sind gesperrt. Statusdetails bleiben im Statusbereich verfügbar.</p>
{:else if !eligible && tlsIsOff(tls)}
  <p class="hint">
    Für HTTPS zuerst unter „{NETWORK_PROXY_EXPANDER_TITLE}“ „Proxy an“ auswählen (aktivieren).
  </p>
{:else if tlsIsOff(tls) && state.startPhase === 'offer'}
  <p class="hint">HTTPS verschlüsselt die Verbindung Ihrer Praxisgeräte. Während der Vorbereitung bleibt der bisherige HTTP-Zugang bestehen.</p>
  <div class="actions-row">
    <button type="button" disabled={busy} onclick={() => controller.startPrepare()}>HTTPS vorbereiten</button>
  </div>
{:else if starting && state.startPhase === 'hostname'}
  <fieldset class="wizard-fieldset">
    <legend class="wizard-field-label">Adresse wählen</legend>
    <label class="wizard-radio">
      <input
        type="radio"
        name="tls-name-mode"
        checked={state.nameMode === 'generated'}
        disabled={busy}
        onchange={() => controller.patchDraft({ nameMode: 'generated' })}
      />
      <span>Vorschlag unter <code>{TLS_OPERATOR_ZONE}</code></span>
    </label>
    <label class="wizard-radio">
      <input
        type="radio"
        name="tls-name-mode"
        checked={state.nameMode === 'label'}
        disabled={busy}
        onchange={() => controller.patchDraft({ nameMode: 'label' })}
      />
      <span>Eigener Name unter <code>{TLS_OPERATOR_ZONE}</code></span>
    </label>
    {#if state.nameMode === 'label'}
      <input
        class="wizard-input is-monospace"
        value={state.customLabel}
        disabled={busy}
        placeholder="muster"
        oninput={(event) => controller.patchDraft({ customLabel: event.currentTarget.value })}
      />
    {/if}
    <label class="wizard-radio">
      <input
        type="radio"
        name="tls-name-mode"
        checked={state.nameMode === 'domain'}
        disabled={busy}
        onchange={() => controller.patchDraft({ nameMode: 'domain' })}
      />
      <span>Eigene Domain</span>
    </label>
    {#if state.nameMode === 'domain'}
      <input
        class="wizard-input is-monospace"
        value={state.customDomain}
        disabled={busy}
        placeholder="wartezimmer.praxis-meyer.de"
        oninput={(event) => controller.patchDraft({ customDomain: event.currentTarget.value })}
      />
      <label class="wizard-radio">
        <input type="radio" name="tls-certificate-mode" checked={state.certificateMode === 'managed'} disabled={busy}
          onchange={() => controller.patchDraft({ certificateMode: 'managed' })} />
        <span>Automatisch mit Let's Encrypt (ACME, empfohlen)</span>
      </label>
      <label class="wizard-radio">
        <input type="radio" name="tls-certificate-mode" checked={state.certificateMode === 'custom'} disabled={busy}
          onchange={() => controller.patchDraft({ certificateMode: 'custom' })} />
        <span>Vorhandenes Zertifikat einlesen (PEM)</span>
      </label>
      {#if state.certificateMode === 'managed'}
        <p class="hint">Eine eigene Unterdomain wie <code>wartezimmer.praxis-meyer.de</code> verwenden.
          Einmal A- und CNAME-Einträge bei Ihrem DNS-Anbieter setzen; Ausstellung und Erneuerung laufen danach automatisch.
          Keine Portweiterleitung erforderlich.</p>
        {#if tlsNameValid(state)}
          <p class="hint">Praxisgeräte: <code>staff.{draftDomain}</code><br />
            Separater Portalzugang: <code>portal.{draftDomain}</code> (später aktivieren)<br />
            Zertifikat: <code>*.{draftDomain}</code>. Die eingegebene Basisdomain selbst wird nicht als Geräteadresse verwendet.</p>
        {/if}
      {:else}
        <p class="hint">Die eingegebene Domain ist die vollständige Adresse für Praxisgeräte.
          Das Zertifikat muss genau diesen Namen abdecken; ein Wildcard-Zertifikat gilt nur für eine zusätzliche Namensebene.
          Vollständige PEM-Zertifikatskette und passenden unverschlüsselten privaten Schlüssel bereithalten.
          Erneuerung erfolgt manuell. Ein separater Portalzugang wird mit PEM derzeit nicht unterstützt.</p>
      {/if}
    {/if}
  </fieldset>
  <div class="actions-row">
    <button type="button" class="btn-link" disabled={busy} onclick={() => controller.back()}>Zurück</button>
    <button type="button" disabled={busy || !tlsNameValid(state)} onclick={() => controller.advanceHostname()}>
      Weiter
    </button>
  </div>
{:else if starting && state.startPhase === 'lease'}
  <p class="hint">
    {lanIp ?? 'Keine LAN-IP'}
    {#if candidate}
      · {candidate.interfaceName}{#if candidate.mac} · <code>MAC {candidate.mac}</code>{/if}
    {/if}
  </p>
  {#if staleLan}
    <p class="notice is-warn">{TLS_LEASE_STALE_LAN_COPY}</p>
  {/if}
  <label class="wizard-checkbox">
    <input
      type="checkbox"
      checked={state.ipv4Reserved}
      disabled={busy || staleLan}
      onchange={(event) => controller.patchDraft({ ipv4Reserved: event.currentTarget.checked })}
    />
    <span>
      Ich bestätige, dass der Wartezimmer-Server entweder eine statische IP oder einen statischen DHCP-Eintrag hat.
    </span>
  </label>
  <div class="actions-row">
    <button type="button" class="btn-link" disabled={busy} onclick={() => controller.back()}>Zurück</button>
    <button type="button" disabled={busy || staleLan || !state.ipv4Reserved} onclick={() => void controller.submitLease()}>
      {state.nameMode === 'domain' ? 'Vorbereiten' : 'Mail vorbereiten'}
    </button>
  </div>
{:else if tls && !tlsIsOff(tls)}
  <div class="network-columns">
  <div class="network-column">
  <h3 class="network-heading">Adresse und Zertifikat</h3>
  {#if tls.hostname}
    <p class="hint hint--preview"><code>https://{tls.hostname}</code></p>
  {/if}
  {#if tlsShowsDnsWaitCopy(tls)}
    <p class="hint">{ownDns && tls.mode === 'managed' ? 'A- und ACME-CNAME-Einträge bei Ihrem DNS-Anbieter anlegen. Die DNS-Übernahme kann bis zu 48 Stunden dauern. HTTP bleibt erreichbar.' : tlsDnsWaitCopy(tls.mode)}</p>
  {/if}

  {#if tls.mode === 'custom'}
    <p class="hint">Benötigter Zertifikatsname: <code>{tls.hostname}</code> (SAN oder passender Wildcard).
      PEM-Kette und passender unverschlüsselter privater Schlüssel erforderlich. Manuelle Erneuerung;
      kein separater Portalzugang mit PEM.</p>
  {:else if tls.wildcardCertificateName}
    <p class="hint">Automatisches Zertifikat: <code>{tls.wildcardCertificateName}</code><br />
      Praxisgeräte: <code>{tls.staffHostname}</code><br />
      Separater Portalzugang: <code>{tls.portalHostname}</code> (eigene Ziel-IP und spätere Aktivierung erforderlich).</p>
  {/if}

  {#if tls.cutoverApplied}
    <dl class="status-grid wizard-summary-grid">
      <dt>Hostname</dt>
      <dd><code>{tls.hostname}</code></dd>
      <dt>Installations-ID</dt>
      <dd><code>{tls.installationId ?? '—'}</code></dd>
      <dt>Aussteller</dt>
      <dd>{tls.certificate?.issuer ?? '—'}</dd>
      <dt>Gültig bis</dt>
      <dd>{formatCertNotAfter(tls.certificate)}</dd>
    </dl>
  {/if}
  </div>
  <div class="network-column">
  <h3 class="network-heading">Status und Aktionen</h3>
  {#if tls.cutoverApplied}
    <p class="hint">
      HTTPS ist eingerichtet. Den aktuellen Laufzustand sehen Sie unter „Interner Praxisbetrieb“.
    </p>

    {#if tlsExpiryKind(tls.certificate) === 'soon'}
      <p class="notice is-warn">Das Zertifikat läuft bald ab (≤ 21 Tage).</p>
    {:else if tlsExpiryKind(tls.certificate) === 'expired'}
      <p class="notice is-bad">Zertifikat ist abgelaufen und muss jetzt erneuert werden.</p>
    {/if}
    <p class="notice is-warn">
      Für internen Betrieb vorgesehen. Keine Router-Portweiterleitung für Port 80 oder 443 ins Internet einrichten.
    </p>
    {#if tlsCanRenew(tls)}
      <div class="actions-row">
        <button type="button" disabled={busy} onclick={() => void controller.renew()}>
          {tls.mode === 'custom' ? 'Neues Zertifikat einlesen' : 'Jetzt erneuern'}
        </button>
      </div>
    {/if}
  {:else}
    <ul class="checklist">
      {#each tlsDiagnoseItems({ tls, ipv4Reserved: true, checks: state.dnsChecks }) as item (item.text)}
        <li class={item.status}>
          <span class="checklist-mark">{item.status === 'is-done' ? '✓' : item.status === 'is-bad' ? '✗' : '○'}</span>
          <span>{item.text}</span>
        </li>
      {/each}
    </ul>

    {#if tlsIsPersistedFailBeforeCutover(tls)}
      {#if tlsShowsStructuredLastErrorNotice(tls)}
        {@const copy = tlsErrorCopy(tls.lastError?.class, tls.lastError?.message)}
        <p class="notice is-bad">{copy.title}</p>
        <p class="hint">{copy.action}</p>
      {/if}
      <div class="actions-row">
        {#if tlsCanRepair(tls)}
          <button type="button" disabled={busy} onclick={() => void controller.repair()}>Erneut versuchen</button>
        {/if}
        {#if tlsCanResetBeforeCutover(tls)}
          <button type="button" class="btn-secondary" disabled={busy} onclick={() => controller.reset()}>
            HTTPS-Vorbereitung verwerfen
          </button>
        {/if}
      </div>
    {:else if tlsShowsObtainWait(tls, tlsNetworkPendingObtain(state))}
      <p class="notice is-ok">
        {tls.mode === 'custom'
          ? 'Zertifikat wird geprüft — HTTP bleibt erreichbar.'
          : 'DNS-Einträge stimmen. Zertifikat wird angefordert — HTTP bleibt erreichbar.'}
      </p>
      <div class="actions-row" role="status">
        <span class="spinner" aria-hidden="true"></span>
        <span class="hint">Kann einige Minuten dauern.</span>
      </div>
      <ul class="checklist">
        {#each tlsLocalCheckItems({
          tls,
          checks: state.localChecks,
          inFlight: true,
        }) as item (item.text)}
          <li class={item.status}>
            <span class="checklist-mark">{item.status === 'is-done' ? '✓' : '○'}</span>
            <span>{item.text}</span>
          </li>
        {/each}
      </ul>
      <div class="actions-row">
        <button type="button" class="btn-secondary" disabled={busy} onclick={() => controller.reset()}>
          HTTPS-Vorbereitung verwerfen
        </button>
      </div>
    {:else if tlsCanApply(tls)}
      {#if tlsIsApplyFail(tls)}
        {@const applyFailCopy = tlsErrorCopy(tls.lastError?.class, tls.lastError?.message)}
        <p class="notice is-bad">{applyFailCopy.title}</p>
        <p class="hint">{applyFailCopy.action}</p>
      {/if}
      <ul class="checklist">
        {#each tlsLocalCheckItems({ tls, checks: state.localChecks }) as item (item.text)}
          <li class={item.status}>
            <span class="checklist-mark">{item.status === 'is-done' ? '✓' : item.status === 'is-bad' ? '✗' : '○'}</span>
            <span>{item.text}</span>
          </li>
        {/each}
      </ul>
      <p class="notice is-ok">Zertifikat liegt vor. Geräte nutzen noch HTTP.</p>
      <p class="notice is-warn">
        Für internen Betrieb vorgesehen. Keine Router-Portweiterleitung für Port 80 oder 443 ins Internet einrichten.
      </p>
      <p class="notice is-warn">{TLS_CUTOVER_CONFIRM_MESSAGE}</p>
      <div class="actions-row">
        <button type="button" disabled={busy} onclick={() => controller.apply()}>Auf HTTPS umstellen</button>
        <button type="button" class="btn-secondary" disabled={busy} onclick={() => controller.reset()}>
          HTTPS-Vorbereitung verwerfen
        </button>
      </div>
    {:else if tlsCanObtain(tls)}
      <p class="notice is-ok">
        Die HTTPS-Adresse zeigt auf diesen Rechner. HTTP bleibt, bis das Zertifikat da ist und HTTPS übernommen wird.
      </p>
      <div class="actions-row">
        {#if tls.mode === 'custom'}
          <button
            type="button"
            class="btn-secondary"
            disabled={busy}
            onclick={() => void controller.stageCustomCertificate()}
          >
            Zertifikat einlesen (PEM)
          </button>
        {/if}
        <button type="button" disabled={busy || (tls.mode === 'custom' && !tls.certificate)} onclick={() => void controller.obtainOrCheck()}>
          {tls.mode === 'custom' ? 'Lokal prüfen' : 'Zertifikat anfordern'}
        </button>
        <button type="button" class="btn-secondary" disabled={busy} onclick={() => controller.reset()}>
          HTTPS-Vorbereitung verwerfen
        </button>
      </div>
      <p class="hint">
        {tls.mode === 'custom'
          ? 'Prüft das Zertifikat und die HTTPS-Verbindung einschließlich laufender Aktualisierungen. HTTP bleibt dabei bestehen.'
          : 'Holt das Zertifikat, während Wartezimmer weiter über HTTP erreichbar ist. Umstellen ist ein eigener Schritt.'}
      </p>
    {:else if tlsCanVerifyDns(tls)}
      <div class="actions-row tls-dns-actions">
        {#if tls.mode === 'custom'}
          <button
            type="button"
            class="btn-secondary"
            disabled={busy}
            onclick={() => void controller.stageCustomCertificate()}
          >
            {tls.certificate ? 'Zertifikat erneut einlesen (PEM)' : 'Zertifikat einlesen (PEM)'}
          </button>
        {/if}
        <button type="button" disabled={busy} onclick={() => void controller.verifyDns()}>DNS prüfen</button>
        <button type="button" class="btn-secondary" disabled={busy} onclick={() => controller.reset()}>
          HTTPS-Vorbereitung verwerfen
        </button>
      </div>
    {/if}

    {#if ownDns && tls.hostname && lanIp}
      <details
        open={state.revealOperatorRecords}
        ontoggle={(event) =>
          controller.setRevealOperatorRecords(event.currentTarget.open)}
      >
        <summary>DNS-Einträge anzeigen</summary>
        {#if tls.portalHostname}
          <p class="hint">Für den späteren separaten Portalzugang <code>&lt;PORTAL-ZIEL-IP&gt;</code> durch die mit Ihrer Praxis-IT festgelegte private IPv4 ersetzen. Der DNS-Eintrag allein aktiviert den Zugang nicht.</p>
        {/if}
        {#if tls.mode === 'managed'}
          <p class="hint">Den ACME-CNAME dauerhaft beibehalten: Er ermöglicht auch die automatische Erneuerung.</p>
        {/if}
        <textarea class="wizard-input is-monospace is-compact" readonly>{dnsBody}</textarea>
        <div class="actions-row">
          <button
            type="button"
            class="btn-secondary"
            onclick={() => void navigator.clipboard.writeText(dnsBody)}
          >
            In Zwischenablage kopieren
          </button>
        </div>
      </details>
    {:else if mail}
      <details
        open={state.revealOperatorRecords}
        ontoggle={(event) =>
          controller.setRevealOperatorRecords(event.currentTarget.open)}
      >
        <summary>Mailtext anzeigen</summary>
        <label class="wizard-field-label" for="tls-mail-to">An</label>
        <input id="tls-mail-to" class="wizard-input" readonly value={TLS_OPERATOR_MAIL} />
        <label class="wizard-field-label" for="tls-mail-body">Mailtext</label>
        <textarea id="tls-mail-body" class="wizard-input is-monospace is-compact" readonly>{mail.body}</textarea>
        <div class="actions-row">
          <button type="button" class="btn-secondary" onclick={() => onOpenMail(mail.href)}>Mail öffnen</button>
          <button type="button" class="btn-secondary" onclick={() => void navigator.clipboard.writeText(mail.body)}>
            In Zwischenablage kopieren
          </button>
        </div>
      </details>
    {/if}
  {/if}
  </div>
  </div>
{/if}

{#if tlsNetworkShowsGenericErrorFooter(tls, tlsNetworkError(state))}
  <p class="error">{tlsNetworkError(state)}</p>
{/if}

<style>
  .tls-dns-actions {
    margin-block: 1rem;
  }
</style>
