<script lang="ts">
  import type { WizardController } from './wizard-controller.js';
  import type { WizardControllerState } from './wizard-controller.js';
  import {
    TLS_OPERATOR_MAIL,
    TLS_OPERATOR_ZONE,
    isOwnDomainNameMode,
    mailtoHref,
    operatorMailSubject,
    operatorZoneMailBody,
    practiceARecordBody,
    tlsNameValid,
    tlsWizardDisplayHostname,
  } from './tls-identity.js';
  import { WIZARD_HTTPS_CONTINUE_COPY, wizardHttpsDnsWaitCopy } from './wizard-view-model.js';
  import { resolvedLanIp } from './wizard-state.js';
  import { TLS_LEASE_STALE_LAN_COPY, tlsLeaseBlockedByStaleLan } from './tls-network-view-model.js';

  let {
    snapshot,
    controller,
    onPatch,
  }: {
    snapshot: WizardControllerState;
    controller: WizardController;
    onPatch: () => void;
  } = $props();

  const lanIp = $derived(resolvedLanIp(snapshot));
  const candidate = $derived(
    (snapshot.network?.lanCandidates ?? []).find((item) => item.address === lanIp) ??
      snapshot.status?.network.currentLanCandidates.find((item) => item.address === lanIp) ??
      null,
  );
  const hostname = $derived(
    tlsWizardDisplayHostname(
      { ...snapshot, preparedNameMode: snapshot.httpsPreparedNameMode },
      snapshot.status?.tls,
    ),
  );
  const nameOk = $derived(tlsNameValid(snapshot));
  const ownDomain = $derived(isOwnDomainNameMode(snapshot.nameMode));
  const staleLan = $derived(tlsLeaseBlockedByStaleLan(snapshot.status?.network.lanIpStale));
  const mail = $derived.by(() => {
    const installationId =
      snapshot.operatorRequest?.installationId || snapshot.status?.tls?.installationId;
    if (!hostname || !installationId || !lanIp || ownDomain) {
      return null;
    }
    const tokenConsumed = Boolean(snapshot.status?.tls?.tokenConsumed);
    const token = tokenConsumed ? null : snapshot.operatorRequest?.oneTimeToken;
    const cname =
      snapshot.operatorRequest?.acmeCname.value || snapshot.status?.tls?.acmeCnameTarget;
    const body = operatorZoneMailBody({
      hostname,
      lanIp,
      installationId,
      token,
      tokenConsumed,
      acmeCnameTarget: cname ?? null,
    });
    return {
      body,
      href: mailtoHref(TLS_OPERATOR_MAIL, operatorMailSubject(hostname), body),
    };
  });

  function patch(
    fields: Parameters<WizardController['patchFields']>[0],
  ): void {
    controller.patchFields(fields);
    onPatch();
  }

  async function copyText(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      patch({ httpsCopyNotice: 'Kopiert.' });
    } catch {
      patch({ httpsCopyNotice: 'Kopieren nicht möglich.' });
    }
  }
</script>

{#if snapshot.httpsPhase === 'offer'}
  <p class="wizard-step-lead">
    HTTPS: Schloss im Browser. Jetzt vorbereiten oder später hier in der Manager-App einrichten.
  </p>
  <fieldset class="wizard-fieldset">
    <label class="wizard-radio">
      <input
        type="radio"
        name="wizard-tls-offer"
        checked={snapshot.httpsOfferChoice === 'now'}
        disabled={snapshot.busy}
        onchange={() => patch({ httpsOfferChoice: 'now' })}
      />
      <span>Jetzt vorbereiten (empfohlen)</span>
    </label>
    <label class="wizard-radio">
      <input
        type="radio"
        name="wizard-tls-offer"
        checked={snapshot.httpsOfferChoice === 'later'}
        disabled={snapshot.busy}
        onchange={() => patch({ httpsOfferChoice: 'later' })}
      />
      <span>Später — vorerst nur die IP</span>
    </label>
  </fieldset>
{:else if snapshot.httpsPhase === 'hostname'}
  <p class="wizard-step-lead">Das wird die neue HTTPS-Adresse für den Zugriff auf Praxis Flow.</p>
  <p class="hint hint--preview">HTTPS-Adresse <code>https://{hostname}</code></p>
  <fieldset class="wizard-fieldset">
    <legend class="wizard-field-label">Adresse wählen</legend>
    <label class="wizard-radio">
      <input
        type="radio"
        name="wizard-tls-name-mode"
        checked={snapshot.nameMode === 'generated'}
        disabled={snapshot.busy}
        onchange={() => patch({ nameMode: 'generated' })}
      />
      <span>
        <strong>Vorschlag</strong>
        <span class="hint">6 Zeichen unter <code>{TLS_OPERATOR_ZONE}</code></span>
      </span>
    </label>
    {#if snapshot.nameMode === 'generated'}
      <div class="wizard-nested">
        <p class="hint">
          Ein anonymer Name bei öffentlichen DNS-Servern, abgeleitet aus einer internen
          Installations-ID.
        </p>
      </div>
    {/if}
    <label class="wizard-radio">
      <input
        type="radio"
        name="wizard-tls-name-mode"
        checked={snapshot.nameMode === 'label'}
        disabled={snapshot.busy}
        onchange={() => patch({ nameMode: 'label' })}
      />
      <span>
        <strong>Eigenes Label</strong>
        <span class="hint">ebenfalls <code>*.{TLS_OPERATOR_ZONE}</code></span>
      </span>
    </label>
    {#if snapshot.nameMode === 'label'}
      <div class="wizard-nested">
        <label class="wizard-field-label" for="wizard-tls-label">Label</label>
        <input
          id="wizard-tls-label"
          class="wizard-input is-monospace"
          maxlength="63"
          value={snapshot.customLabel}
          disabled={snapshot.busy}
          placeholder="seidel"
          oninput={(event) => patch({ customLabel: event.currentTarget.value })}
        />
        {#if !nameOk}
          <p class="notice is-bad">
            DNS-Label: a–z, 0–9, Bindestrich, 1–63 Zeichen; nicht am Rand Bindestrich; keine
            Umlaute; nicht lan/acme/www/portal/mail.
          </p>
        {/if}
        <p class="hint">Wunschname in derselben Zone wie der Vorschlag.</p>
      </div>
    {/if}
    <label class="wizard-radio">
      <input
        type="radio"
        name="wizard-tls-name-mode"
        checked={snapshot.nameMode === 'domain'}
        disabled={snapshot.busy}
        onchange={() => patch({ nameMode: 'domain' })}
      />
      <span>
        <strong>Eigene Domain</strong>
        <span class="hint">eigenes Zertifikat, nur A-Record</span>
      </span>
    </label>
    {#if snapshot.nameMode === 'domain'}
      <div class="wizard-nested">
        <label class="wizard-field-label" for="wizard-tls-domain">Adresse (ohne https://)</label>
        <input
          id="wizard-tls-domain"
          class="wizard-input is-monospace"
          value={snapshot.customDomain}
          disabled={snapshot.busy}
          placeholder="flow.praxis-meyer.de"
          oninput={(event) => patch({ customDomain: event.currentTarget.value })}
        />
        {#if !nameOk}
          <p class="notice is-bad">
            Voller Name mit Punkt, z. B. flow.praxis-meyer.de — nicht unter {TLS_OPERATOR_ZONE}.
          </p>
        {/if}
        <p class="hint">
          Eine Domain, die Sie selbst verwalten. Zertifikat als PEM einlesen — nur A-Record, kein
          ACME.
        </p>
      </div>
    {/if}
  </fieldset>
{:else if snapshot.httpsPhase === 'lease'}
  <p class="wizard-step-lead">
    {#if ownDomain}
      Dieselbe IPv4 tragen <strong>Sie</strong> beim Domain-Anbieter als A-Record ein. Wechselt die
      IP, stimmt die Adresse nicht mehr.
    {:else}
      HTTPS braucht eine feste IP dieses Rechners. Wechselt die IP, stimmt die Adresse nicht mehr.
    {/if}
  </p>
  <div class="lan-ip-status">
    <div class="lan-ip-status-row">
      <span class="lan-ip-status-label">Adresse</span>
      <strong class="lan-ip-status-value">{lanIp || '—'}</strong>
    </div>
    <div class="lan-ip-status-row">
      <span class="lan-ip-status-label">Karte</span>
      <span class="lan-ip-status-value">
        {candidate?.interfaceName ?? '—'}
        {#if candidate?.mac}
          <span class="hint">MAC {candidate.mac}</span>
        {/if}
      </span>
    </div>
    <div class="lan-ip-status-row">
      <span class="lan-ip-status-label">HTTPS</span>
      <strong class="lan-ip-status-value">{hostname}</strong>
    </div>
  </div>
  {#if staleLan}
    <p class="notice is-warn">{TLS_LEASE_STALE_LAN_COPY}</p>
  {/if}
  <label class="wizard-checkbox">
    <input
      type="checkbox"
      checked={snapshot.ipv4Reserved}
      disabled={snapshot.busy || staleLan}
      onchange={(event) => patch({ ipv4Reserved: event.currentTarget.checked })}
    />
    <span>
      Ich bestätige, dass der Praxis-Flow-Server entweder eine statische IP oder einen statischen
      DHCP-Eintrag hat.
    </span>
  </label>
  <p class="notice is-warn">
    Keine Portfreigabe im Router einrichten. Praxis Flow und das Portal sind nur fürs Praxisnetz
    gedacht — nicht für den Zugriff aus dem Internet.
  </p>
{:else if snapshot.httpsPhase === 'mail'}
  {#if ownDomain}
    <p class="wizard-step-lead">
      Zertifikat und Schlüssel hier einlesen. Der Manager prüft das Format und überträgt den Inhalt
      — kein Dateipfad nach Docker.
    </p>
    <div class="actions-row">
      <button
        type="button"
        class="btn-secondary"
        disabled={snapshot.busy}
        onclick={() => void controller.stageWizardTlsCertificate().then(onPatch)}
      >
        {snapshot.customPemStaged ? 'PEM erneut einlesen' : 'PEM einlesen'}
      </button>
    </div>
    <p class="hint">Beim Domain-Anbieter nur den A-Record setzen — kein ACME-CNAME.</p>
    {#if lanIp}
      <textarea class="wizard-input is-monospace" readonly>{practiceARecordBody(hostname, lanIp)}</textarea>
      <div class="actions-row">
        <button
          type="button"
          class="btn-secondary"
          onclick={() => void copyText(practiceARecordBody(hostname, lanIp))}
        >
          In Zwischenablage kopieren
        </button>
      </div>
    {/if}
    {#if snapshot.customPemStaged}
      <p class="notice is-ok">{wizardHttpsDnsWaitCopy('custom')} {WIZARD_HTTPS_CONTINUE_COPY}</p>
    {:else}
      <p class="notice is-warn">Ohne geprüftes Zertifikat (PEM) gibt es kein HTTPS.</p>
    {/if}
  {:else if mail}
    <p class="wizard-step-lead">
      Basierend auf der zuvor gewählten IP-Adresse und dem Namen richtet Praxis Flow die
      erforderlichen DNS-Einträge ein, damit das Zertifikat anschließend automatisch ausgestellt
      und erneuert werden kann. Hierzu senden Sie bitte den nachfolgenden Text an
      <code>{TLS_OPERATOR_MAIL}</code>.
    </p>
    <label class="wizard-field-label" for="wizard-tls-mail-to">An (Praxis Flow)</label>
    <input id="wizard-tls-mail-to" class="wizard-input" readonly value={TLS_OPERATOR_MAIL} />
    <label class="wizard-field-label" for="wizard-tls-mail-subject">Betreff</label>
    <input
      id="wizard-tls-mail-subject"
      class="wizard-input"
      readonly
      value={operatorMailSubject(hostname)}
    />
    <label class="wizard-field-label" for="wizard-tls-mail-body">Mailtext</label>
    <textarea id="wizard-tls-mail-body" class="wizard-input is-monospace" readonly>{mail.body}</textarea>
    <div class="actions-row">
      <button type="button" onclick={() => controller.openMailto(mail.href)}>Mail öffnen</button>
      <button type="button" class="btn-secondary" onclick={() => void copyText(mail.body)}>
        In Zwischenablage kopieren
      </button>
    </div>
    <label class="wizard-checkbox">
      <input
        type="checkbox"
        checked={snapshot.mailAck}
        disabled={snapshot.busy}
        onchange={(event) => patch({ mailAck: event.currentTarget.checked })}
      />
      <span>Ich habe die Mail an Praxis Flow ({TLS_OPERATOR_MAIL}) geschickt.</span>
    </label>
    {#if snapshot.mailAck}
      <p class="notice is-ok">{wizardHttpsDnsWaitCopy('managed')} {WIZARD_HTTPS_CONTINUE_COPY}</p>
    {:else}
      <p class="notice is-warn">
        Ohne diese Mail an Praxis Flow gibt es kein Zertifikat. Weiter ist erst nach dem Haken frei.
      </p>
    {/if}
  {:else}
    <p class="notice is-warn">Mailtext wird vorbereitet …</p>
  {/if}
  {#if snapshot.httpsCopyNotice}
    <p class="hint">{snapshot.httpsCopyNotice}</p>
  {/if}
{/if}
