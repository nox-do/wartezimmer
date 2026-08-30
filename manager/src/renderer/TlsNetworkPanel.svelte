<script lang="ts">
  import type { HostStatus, NetworkSnapshot, TlsOperatorRequest, TlsStatus } from '../shared/host-status.js';
  import type { TlsNetworkController, TlsNetworkState } from './tls-network-controller.js';
  import {
    TLS_OPERATOR_MAIL,
    TLS_OPERATOR_ZONE,
    mailtoHref,
    operatorMailSubject,
    operatorZoneMailBody,
    practiceARecordBody,
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
    tlsShowsStructuredLastErrorNotice,
  } from './tls-network-view-model.js';
  import {
    NETWORK_APPLY_BUTTON_LABEL,
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
  const mail = $derived(mailModel(tls, state.operatorRequest, lanIp));

  function mailModel(
    current: TlsStatus | undefined,
    operator: TlsOperatorRequest | null,
    ip: string | null,
  ): { body: string; href: string } | null {
    const hostname = current?.hostname;
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

{#if !eligible && tlsIsOff(tls)}
  <p class="notice is-warn">
    HTTPS braucht Port 80. Zuerst unter {NETWORK_PROXY_EXPANDER_TITLE} einschalten, dann
    „{NETWORK_APPLY_BUTTON_LABEL}“.
  </p>
{:else if tlsIsOff(tls) && state.startPhase === 'offer'}
  <p class="hint">Noch nicht vorbereitet. HTTPS hier vorbereiten.</p>
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
      <span>Eigenes Label unter <code>{TLS_OPERATOR_ZONE}</code></span>
    </label>
    {#if state.nameMode === 'label'}
      <input
        class="wizard-input is-monospace"
        value={state.customLabel}
        disabled={busy}
        placeholder="seidel"
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
      <span>Eigene Domain (PEM statt Let's Encrypt)</span>
    </label>
    {#if state.nameMode === 'domain'}
      <input
        class="wizard-input is-monospace"
        value={state.customDomain}
        disabled={busy}
        placeholder="flow.praxis-meyer.de"
        oninput={(event) => controller.patchDraft({ customDomain: event.currentTarget.value })}
      />
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
      Ich bestätige, dass der Praxis-Flow-Server entweder eine statische IP oder einen statischen DHCP-Eintrag hat.
    </span>
  </label>
  <div class="actions-row">
    <button type="button" class="btn-link" disabled={busy} onclick={() => controller.back()}>Zurück</button>
    <button type="button" disabled={busy || staleLan || !state.ipv4Reserved} onclick={() => void controller.submitLease()}>
      {state.nameMode === 'domain' ? 'Vorbereiten' : 'Mail vorbereiten'}
    </button>
  </div>
{:else if tls && !tlsIsOff(tls)}
  {#if tls.hostname}
    <p class="hint hint--preview"><code>https://{tls.hostname}</code></p>
  {/if}
  {#if tlsShowsDnsWaitCopy(tls)}
    <p class="hint">{tlsDnsWaitCopy(tls.mode)}</p>
  {/if}

  {#if tls.cutoverApplied}
    <p class="notice is-ok">
      Geräte nutzen <code>https://{tls.hostname}</code>. Proxy nur Weiterleitung.
    </p>
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
    {#if tlsExpiryKind(tls.certificate) === 'soon'}
      <p class="notice is-warn">Das Zertifikat läuft bald ab (≤ 21 Tage).</p>
    {:else if tlsExpiryKind(tls.certificate) === 'expired'}
      <p class="notice is-bad">Zertifikat ist abgelaufen und muss jetzt erneuert werden.</p>
    {/if}
    <p class="notice is-warn">
      Gültiges Zertifikat plus Portweiterleitung 443 legt die ganze App ins Internet. 80 und 443 nicht freigeben.
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
    {:else if tls.state === 'obtaining-certificate'}
      <p class="notice is-ok">DNS stimmt. Zertifikat wird geholt — HTTP bleibt erreichbar.</p>
      <ul class="checklist">
        {#each tlsLocalCheckItems({ tls, checks: state.localChecks }) as item (item.text)}
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
        Gültiges Zertifikat plus Portweiterleitung 443 legt die ganze App ins Internet. 80 und 443 nicht freigeben.
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
            PEM einlesen
          </button>
        {/if}
        <button type="button" disabled={busy} onclick={() => void controller.obtainOrCheck()}>
          {tls.mode === 'custom' ? 'Lokal prüfen' : 'Zertifikat holen'}
        </button>
        <button type="button" class="btn-secondary" disabled={busy} onclick={() => controller.reset()}>
          HTTPS-Vorbereitung verwerfen
        </button>
      </div>
      <p class="hint">
        {tls.mode === 'custom'
          ? 'Prüft 443, Kette, HTTP/2 und SSE, während HTTP weiterläuft.'
          : 'Holt das Zertifikat, während die Praxis weiter über HTTP arbeitet. Umstellen ist ein eigener Schritt.'}
      </p>
    {:else if tlsCanVerifyDns(tls)}
      {#if tls.mode === 'custom'}
        <div class="actions-row">
          <button
            type="button"
            class="btn-secondary"
            disabled={busy}
            onclick={() => void controller.stageCustomCertificate()}
          >
            {state.customPemStaged ? 'PEM erneut einlesen' : 'PEM einlesen'}
          </button>
        </div>
      {/if}
      <div class="actions-row">
        <button type="button" disabled={busy} onclick={() => void controller.verifyDns()}>DNS prüfen</button>
        <button type="button" class="btn-secondary" disabled={busy} onclick={() => controller.reset()}>
          HTTPS-Vorbereitung verwerfen
        </button>
      </div>
    {/if}

    {#if tls.mode === 'custom' && tls.hostname && lanIp}
      <details>
        <summary>DNS-Records anzeigen</summary>
        <textarea class="wizard-input is-monospace is-compact" readonly>{practiceARecordBody(tls.hostname, lanIp)}</textarea>
        <div class="actions-row">
          <button
            type="button"
            class="btn-secondary"
            onclick={() => void navigator.clipboard.writeText(practiceARecordBody(tls.hostname ?? '', lanIp))}
          >
            In Zwischenablage kopieren
          </button>
        </div>
      </details>
    {:else if mail}
      <details>
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
{/if}

{#if tlsNetworkShowsGenericErrorFooter(tls, state.error)}
  <p class="error">{state.error}</p>
{/if}
