/**
 * LAN-TLS wizard mock — DOM only.
 *
 * Model / flow: ./tls-model.js (lift that first).
 * Existing Manager surfaces to extend:
 *   WizardStepIndicator.svelte  — HTTPS dots while step 6 is current
 *   WizardSteps.svelte          — new case for step 6 (HTTPS phases)
 *   wizard-flow.ts              — planWizardNext / skip HTTPS without proxy
 *   NetworkView.svelte          — HTTPS follow-up; do not put TLS in POST /host/network
 *   StatusView.svelte / SetupEntry.svelte — awaiting-dns card → Network tab
 *
 * German copy stays here. Logic stays in tls-model.js.
 */

import {
  HTTPS_PHASES,
  NAME_MODE,
  OPERATOR_MAIL,
  OPERATOR_ZONE,
  SAMPLE,
  WIZARD_STEP,
  WIZARD_STEP_LABELS,
  WIZARD_STEP_TITLES,
  canonicalOrigin,
  deriveTlsState,
  devicePaths,
  diagnoseItems,
  hostnameOf,
  httpOrigin,
  httpsEligible,
  httpsPhaseIndex,
  isOwnDomain,
  mailReady,
  mailtoHref,
  nameValid,
  operatorMailSubject,
  operatorZoneMailBody,
  planNetworkTlsBack,
  planNetworkTlsNext,
  planWizardBack,
  planWizardNext,
  practiceDnsRecordsBody,
  rebindFallback,
  wizardBackHidden,
  wizardNextDisabled,
  wizardNextLabel,
} from './tls-model.js';

const state = {
  view: 'wizard',
  step: WIZARD_STEP.network,
  tlsPhase: 'offer',
  lanIndex: 0,
  proxyEnabled: true,
  ipv4Reserved: false,
  nameMode: NAME_MODE.generated,
  customLabel: '',
  customDomain: '',
  mailSent: false,
  mailAck: false,
  practiceDnsAck: false,
  mailNotedAt: '',
  secondDeviceOk: false,
  diagnose: null,
  rebindHint: false,
  tlsApplied: false,
  httpSaveNotice: false,
};

function selectedLan() {
  return SAMPLE.lan[state.lanIndex] ?? SAMPLE.lan[0];
}

function lanIp() {
  return selectedLan().address;
}

function hostname() {
  return hostnameOf({
    nameMode: state.nameMode,
    customLabel: state.customLabel,
    customDomain: state.customDomain,
  });
}

function nameOk() {
  return nameValid({
    nameMode: state.nameMode,
    customLabel: state.customLabel,
    customDomain: state.customDomain,
  });
}

function mailIsReady() {
  return mailReady({
    nameMode: state.nameMode,
    mailAck: state.mailAck,
    practiceDnsAck: state.practiceDnsAck,
  });
}

function flowCtx(extra = {}) {
  return {
    proxyEnabled: state.proxyEnabled,
    ipv4Reserved: state.ipv4Reserved,
    nameOk: nameOk(),
    mailIsReady: mailIsReady(),
    ...extra,
  };
}

function httpBase() {
  return httpOrigin(state.proxyEnabled, lanIp());
}

function accessBase() {
  return canonicalOrigin({
    tlsActive: state.tlsApplied,
    hostname: hostname(),
    proxyEnabled: state.proxyEnabled,
    lanIp: lanIp(),
  });
}

function tlsState() {
  return deriveTlsState({
    ipv4Reserved: state.ipv4Reserved,
    mailPrepared: mailIsReady(),
    dnsVerified: state.diagnose === 'ok',
    tlsActive: state.tlsApplied,
  });
}

function tlsIncomplete() {
  return state.ipv4Reserved && !state.tlsApplied;
}

function noProxyHttpsWarning() {
  return 'Ohne Proxy steht HTTPS später nicht zur Verfügung. Proxy und HTTPS können später nachträglich im Tab Netzwerk dieser Manager-App eingerichtet werden.';
}

function dnsWaitCopy() {
  return 'Der Eintrag erfolgt manuell. Nach dem Setzen des DNS-Eintrags kann es bis zu 48 Stunden dauern, bis dieser aktiv ist.';
}

function continueHttpsLaterCopy() {
  return 'Sie können die Einrichtung fortsetzen und HTTPS in den nächsten Tagen hier in der Manager-App fortsetzen.';
}

function operatorBody() {
  return operatorZoneMailBody({ hostname: hostname(), lanIp: lanIp() });
}

function practiceDnsBody() {
  return practiceDnsRecordsBody({ hostname: hostname(), lanIp: lanIp() });
}

function mailHref() {
  return mailtoHref(OPERATOR_MAIL, operatorMailSubject(hostname()), operatorBody());
}

function markMailPrepared() {
  state.mailAck = true;
  state.mailSent = true;
  state.mailNotedAt = state.mailNotedAt || '25.08.2026';
  if (isOwnDomain(state.nameMode)) {
    state.practiceDnsAck = true;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function deviceUrlItems(base) {
  return devicePaths().map(
    ([label, path]) =>
      `<li class="device-url-item"><span>${label}</span><code>${escapeHtml(base)}${path}</code></li>`,
  ).join('');
}

function checklist(items) {
  return `<ul class="checklist">${items
    .map(
      (item) =>
        `<li class="${item.status}"><span class="checklist-mark">${
          item.status === 'is-done' ? '✓' : item.status === 'is-bad' ? '!' : '○'
        }</span><span>${item.text}</span></li>`,
    )
    .join('')}</ul>`;
}

// ---------------------------------------------------------------------------
// WizardStepIndicator — HTTPS sub-step dots (Manager: add next to current badge)
// ---------------------------------------------------------------------------

function httpsProgressMarkup() {
  const here = httpsPhaseIndex(state.tlsPhase);
  const dots = HTTPS_PHASES.map((_, index) => {
    const cls = index < here ? 'is-done' : index === here ? 'is-here' : '';
    return `<span class="wizard-step-dot${cls ? ` ${cls}` : ''}"></span>`;
  }).join('');
  return `<span class="wizard-step-progress" aria-hidden="true">${dots}</span>`;
}

function renderSteps() {
  const current = state.step;
  const skippedHttps = !httpsEligible(state.proxyEnabled) && current > WIZARD_STEP.https;
  const httpsOpen = current === WIZARD_STEP.https && httpsEligible(state.proxyEnabled);
  document.getElementById('wizard-steps').innerHTML = WIZARD_STEP_LABELS.flatMap((label, index) => {
    const id = index + 1;
    const skipped = id === WIZARD_STEP.https && skippedHttps;
    const cls = skipped
      ? 'is-upcoming'
      : id === current
        ? 'is-current'
        : id < current
          ? 'is-done'
          : 'is-upcoming';
    const phaseHere = id === WIZARD_STEP.https && httpsOpen ? httpsPhaseIndex(state.tlsPhase) + 1 : 0;
    const title = skipped
      ? `${label} (übersprungen — kein Proxy)`
      : phaseHere
        ? `${label} ${phaseHere} von ${HTTPS_PHASES.length}`
        : label;
    const currentLabel =
      id === current
        ? `<span class="wizard-step-label">${escapeHtml(label)}</span>${
            httpsOpen && id === WIZARD_STEP.https ? httpsProgressMarkup() : ''
          }`
        : '';
    const item = `<li class="wizard-step-indicator ${cls}" ${
      id === current ? 'aria-current="step"' : ''
    } title="${escapeHtml(title)}"${
      phaseHere ? ` aria-label="${escapeHtml(title)}"` : ''
    }><span class="wizard-step-badge">${id}</span>${currentLabel}</li>`;
    const sep = index > 0 ? '<li class="wizard-step-separator" aria-hidden="true">›</li>' : '';
    return [sep, item];
  }).join('');
}

// ---------------------------------------------------------------------------
// WizardSteps.svelte — existing 1–5 / 7–8 plus new HTTPS case
// ---------------------------------------------------------------------------

function renderBody() {
  const step = state.step;
  if (step === WIZARD_STEP.prerequisites) {
    return `${checklist([
      { status: 'is-done', text: 'Docker installiert' },
      { status: 'is-done', text: 'Docker-Daemon läuft' },
      { status: 'is-done', text: 'Docker Compose verfügbar' },
      { status: 'is-done', text: 'Netzwerkvoraussetzungen prüfen / ok' },
      { status: 'is-done', text: 'Software-Paket (app + sandbox)' },
    ])}<p class="hint">Mock: Voraussetzungen bereits erfüllt.</p>`;
  }

  if (step === WIZARD_STEP.routing) {
    return `<p class="wizard-step-lead">Wie sollen Patienten durch die Praxis geführt werden? Praxisname und Kontaktdaten legt die Praxis später im Ops-Assistenten fest.</p>
      <label class="wizard-radio"><input type="radio" checked disabled /> Simple Routing</label>
      <p class="hint">Mock: Routing ist gewählt. HTTPS hängt nicht am Praxisnamen.</p>`;
  }

  if (step === WIZARD_STEP.folders) {
    return `<p class="wizard-step-lead">Ordner für Kontakt-Import und Dokument-Export auf diesem Rechner.</p>
      <label class="wizard-field-label">Importordner</label>
      <input class="wizard-input" value="C:\\Users\\Praxis\\praxis-flow-imports" readonly />
      <label class="wizard-field-label">Exportordner</label>
      <input class="wizard-input" value="C:\\Users\\Praxis\\praxis-flow-exports" readonly />`;
  }

  if (step === WIZARD_STEP.network) {
    const selected = selectedLan();
    return `<p class="wizard-step-lead">Unter welcher Adresse soll Praxis Flow im Praxisnetz erreichbar sein? HTTPS kommt später, nicht hier.</p>
      <section class="network-config-block">
        <h3 class="network-config-subheading">Host im Praxisnetz</h3>
        <p class="hint">${SAMPLE.lan.length} Adressen gefunden.</p>
        <fieldset class="wizard-fieldset">
          ${SAMPLE.lan
            .map(
              (item, index) => `<label class="wizard-radio">
              <input type="radio" name="lan-ip" value="${index}" ${state.lanIndex === index ? 'checked' : ''} />
              <span>
                <strong>${escapeHtml(item.address)}</strong>
                <span class="radio-meta">${escapeHtml(item.iface)} · MAC ${escapeHtml(item.mac)}</span>
              </span>
            </label>`,
            )
            .join('')}
        </fieldset>
        <p class="host-preview">Vorläufige Geräte-Adresse: ${escapeHtml(selected.address)}</p>
      </section>`;
  }

  if (step === WIZARD_STEP.access) {
    return `<p class="wizard-step-lead">Mit Proxy kann Praxis Flow nativ über Port 80 im Browser angesprochen werden. Zudem ist der Proxy Voraussetzung für die spätere HTTPS-Nutzung.</p>
      <section class="network-config-block">
        <label class="wizard-checkbox">
          <input type="checkbox" id="proxy-enabled" ${state.proxyEnabled ? 'checked' : ''} ${state.ipv4Reserved ? 'disabled' : ''} />
          <span>Proxy aktivieren / deaktivieren</span>
        </label>
        <p class="host-preview">Vorläufig: ${escapeHtml(httpBase())}</p>
        ${state.proxyEnabled ? '' : `<p class="callout is-warn">${noProxyHttpsWarning()}</p>`}
      </section>`;
  }

  if (step === WIZARD_STEP.https) {
    return renderTls();
  }

  if (step === WIZARD_STEP.preview) {
    const base = httpBase();
    const prepared = state.ipv4Reserved;
    const lead = prepared
      ? 'Vorläufig über die IP, bis HTTPS steht.'
      : httpsEligible(state.proxyEnabled)
        ? 'Einrichtung über die IP. HTTPS später unter Netzwerk.'
        : 'Einrichtung über Port 8080. HTTPS erst, wenn der Proxy an ist.';
    return `<p class="wizard-step-lead">${lead}</p>
      <dl class="status-grid">
        <dt>Terminal</dt><dd>${escapeHtml(base)}/terminal</dd>
        <dt>TV</dt><dd>${escapeHtml(base)}/tv</dd>
        <dt>MFA</dt><dd>${escapeHtml(base)}/mfa</dd>
        <dt>Portal (LAN)</dt><dd>${escapeHtml(base)}/portal</dd>
        <dt>Ops</dt><dd>${escapeHtml(base)}/ops/setup</dd>
      </dl>
      ${
        prepared
          ? `<p class="callout is-warn">Geplante HTTPS-Adresse (noch nicht nutzbar): <code>https://${escapeHtml(hostname())}</code>. Bis dahin über die IP. HTTPS später unter Netzwerk.</p>`
          : httpsEligible(state.proxyEnabled)
            ? '<p class="callout is-warn">HTTPS ist nicht vorbereitet. Weitere Einrichtung jetzt über die IP. Später unter Netzwerk.</p>'
            : `<p class="callout is-warn">${noProxyHttpsWarning()}</p>`
      }`;
  }

  if (step === WIZARD_STEP.apply) {
    const httpsNote = state.ipv4Reserved
      ? `<p>HTTPS später unter Netzwerk. ${dnsWaitCopy()}</p>`
      : httpsEligible(state.proxyEnabled)
        ? '<p>HTTPS später unter Netzwerk.</p>'
        : `<p class="callout is-warn">${noProxyHttpsWarning()}</p>`;
    const lead =
      !httpsEligible(state.proxyEnabled) && !state.ipv4Reserved
        ? 'Praxis Flow läuft im Praxisnetz über Port 8080. Sie können den Manager schließen.'
        : 'Host-Einrichtung abgeschlossen. Weitere fachliche Einstellungen (Räume, Themen, Portal) konfigurieren Sie in Praxis Flow.';
    return `<h3 class="network-config-subheading">Anwenden</h3>
      ${checklist([
        { status: 'is-done', text: 'Konfiguration geschrieben' },
        { status: 'is-done', text: 'Docker Compose' },
      ])}
      <h3 class="network-config-subheading">Prüfen</h3>
      ${checklist([
        { status: 'is-done', text: 'Lokale App erreichbar' },
        { status: 'is-done', text: 'Praxisnetz erreichbar' },
      ])}
      <p>${lead}</p>
      ${httpsNote}
      <p class="hint">Standard-PIN für MFA, Ops und Panel: 0000 — MFA/Panel in MFA → Betrieb, Ops in System → PIN &amp; Sicherheit.</p>`;
  }

  return '';
}

// ---------------------------------------------------------------------------
// HTTPS phases (new WizardHttps panel). Hostname is fixed only after TLS apply.
// ---------------------------------------------------------------------------

function renderTls() {
  const phase = state.tlsPhase;
  if (phase === 'offer') {
    return `<p class="wizard-step-lead">HTTPS: Schloss im Browser. Jetzt vorbereiten oder später hier in der Manager-App einrichten.</p>
      <fieldset class="wizard-fieldset">
        <label class="wizard-radio"><input type="radio" name="tls-offer" value="now" checked /> Jetzt vorbereiten (empfohlen)</label>
        <label class="wizard-radio"><input type="radio" name="tls-offer" value="later" /> Später — vorerst nur die IP</label>
      </fieldset>`;
  }

  if (phase === 'hostname') {
    return renderHostnamePhase();
  }

  if (phase === 'lease') {
    const whoSetsA = isOwnDomain(state.nameMode)
      ? `Dieselbe IPv4 tragen <strong>Sie</strong> beim Domain-Anbieter als A-Record ein. Wechselt die IP, stimmt die Adresse nicht mehr.`
      : `HTTPS braucht eine feste IP dieses Rechners. Wechselt die IP, stimmt die Adresse nicht mehr.`;
    return `<p class="wizard-step-lead">${whoSetsA}</p>
      <div class="lan-ip-status">
        <div class="lan-ip-status-row">
          <span class="lan-ip-status-label">Adresse</span>
          <strong class="lan-ip-status-value">${escapeHtml(lanIp())}</strong>
        </div>
        <div class="lan-ip-status-row">
          <span class="lan-ip-status-label">Karte</span>
          <span class="lan-ip-status-value">${escapeHtml(selectedLan().iface)} <span class="radio-meta">MAC ${escapeHtml(selectedLan().mac)}</span></span>
        </div>
        <div class="lan-ip-status-row">
          <span class="lan-ip-status-label">HTTPS</span>
          <strong class="lan-ip-status-value">${escapeHtml(hostname())}</strong>
        </div>
      </div>
      <label class="wizard-checkbox">
        <input type="checkbox" id="ipv4-reserved" ${state.ipv4Reserved ? 'checked' : ''} />
        <span>Ich bestätige, dass der Praxis-Flow-Server entweder eine statische IP oder einen statischen DHCP-Eintrag hat.</span>
      </label>
      <p class="callout is-warn">Keine Portfreigabe im Router einrichten. Praxis Flow und das Portal sind nur fürs Praxisnetz gedacht — nicht für den Zugriff aus dem Internet.</p>`;
  }

  if (phase === 'mail') {
    return `${renderMailTask()}${mailContinueHint()}`;
  }

  return mailContinueHint();
}

function renderHostnamePhase() {
  const mode = state.nameMode;
  const extra =
    mode === NAME_MODE.label
      ? `<div class="wizard-choice-extra">
            <label class="wizard-field-label" for="custom-label">Label</label>
            <input id="custom-label" class="wizard-input" maxlength="20" value="${escapeHtml(state.customLabel)}" placeholder="seidel" />
            ${nameOk() ? '' : '<p class="callout is-bad">Nur a–z, 0–9, Bindestrich; nicht lan/acme/www/portal/mail.</p>'}
            <p class="hint">Wunschname in derselben Zone wie der Vorschlag.</p>
          </div>`
      : mode === NAME_MODE.domain
        ? `<div class="wizard-choice-extra">
            <label class="wizard-field-label" for="custom-domain">Adresse (ohne https://)</label>
            <input id="custom-domain" class="wizard-input" value="${escapeHtml(state.customDomain)}" placeholder="flow.praxis-meyer.de" />
            ${nameOk() ? '' : '<p class="callout is-bad">Voller Name mit Punkt, z. B. flow.praxis-meyer.de — nicht unter lan.notaus.de.</p>'}
            <p class="hint">Eine Domain, die Sie selbst verwalten (IONOS, Strato, …). A-Record und einmaliger CNAME dort.</p>
          </div>`
        : `<div class="wizard-choice-extra">
            <p class="hint">Ein anonymer Name bei öffentlichen DNS-Servern, abgeleitet aus einer internen Installations-ID.</p>
          </div>`;
  return `<p class="wizard-step-lead">Das wird die neue HTTPS-Adresse für den Zugriff auf Praxis Flow.</p>
      <p class="host-preview">https://${escapeHtml(hostname())}</p>
      <fieldset class="wizard-fieldset">
        <div class="wizard-choice">
          <label class="wizard-radio">
            <input type="radio" name="name-mode" value="${NAME_MODE.generated}" ${mode === NAME_MODE.generated ? 'checked' : ''} />
            <span>
              <strong>Vorschlag</strong>
              <span class="radio-meta">6 Zeichen unter <code>${OPERATOR_ZONE}</code></span>
            </span>
          </label>
          ${mode === NAME_MODE.generated ? extra : ''}
        </div>
        <div class="wizard-choice">
          <label class="wizard-radio">
            <input type="radio" name="name-mode" value="${NAME_MODE.label}" ${mode === NAME_MODE.label ? 'checked' : ''} />
            <span>
              <strong>Eigenes Label</strong>
              <span class="radio-meta">ebenfalls <code>*.${OPERATOR_ZONE}</code></span>
            </span>
          </label>
          ${mode === NAME_MODE.label ? extra : ''}
        </div>
        <div class="wizard-choice">
          <label class="wizard-radio">
            <input type="radio" name="name-mode" value="${NAME_MODE.domain}" ${mode === NAME_MODE.domain ? 'checked' : ''} />
            <span>
              <strong>Eigene Domain</strong>
              <span class="radio-meta">DNS beim Domain-Anbieter</span>
            </span>
          </label>
          ${mode === NAME_MODE.domain ? extra : ''}
        </div>
      </fieldset>`;
}

function renderMailTask() {
  if (isOwnDomain(state.nameMode)) {
    return `<p class="wizard-step-lead">Legen Sie diese DNS-Einträge bei Ihrem Domain-Anbieter an (IONOS, Strato, …). Danach kann das Zertifikat automatisch ausgestellt und erneuert werden.</p>
      <textarea class="mail-body" id="practice-dns-body" readonly>${escapeHtml(practiceDnsBody())}</textarea>
      <div class="actions-row">
        <button type="button" class="btn-secondary" id="copy-practice-dns">In Zwischenablage kopieren</button>
      </div>
      <p class="hint" id="copy-dns-status" hidden></p>
      <label class="wizard-checkbox">
        <input type="checkbox" id="practice-dns-ack" ${state.practiceDnsAck ? 'checked' : ''} />
        <span>Ich habe die Einträge beim Domain-Anbieter angelegt.</span>
      </label>`;
  }
  return `<p class="wizard-step-lead">Basierend auf der zuvor gewählten IP-Adresse und dem Namen richtet Praxis Flow die erforderlichen DNS-Einträge ein, damit das Zertifikat anschließend automatisch ausgestellt und erneuert werden kann. Hierzu senden Sie bitte den nachfolgenden Text an <code>${escapeHtml(OPERATOR_MAIL)}</code>.</p>
      <label class="wizard-field-label">An (Praxis Flow)</label>
      <input class="wizard-input" readonly value="${escapeHtml(OPERATOR_MAIL)}" />
      <label class="wizard-field-label">Betreff</label>
      <input class="wizard-input" readonly value="${escapeHtml(operatorMailSubject(hostname()))}" />
      <label class="wizard-field-label">Mailtext</label>
      <textarea class="mail-body" id="mail-body" readonly>${escapeHtml(operatorBody())}</textarea>
      <div class="actions-row">
        <a class="btn-primary-link" id="open-mail" href="${mailHref()}">Mail öffnen</a>
        <button type="button" class="btn-secondary" id="copy-mail">In Zwischenablage kopieren</button>
      </div>
      <label class="wizard-checkbox">
        <input type="checkbox" id="mail-ack" ${state.mailAck ? 'checked' : ''} />
        <span>Ich habe die Mail an Praxis Flow (${escapeHtml(OPERATOR_MAIL)}) geschickt.</span>
      </label>`;
}

function mailContinueHint() {
  if (isOwnDomain(state.nameMode)) {
    if (state.view === 'network') {
      return mailIsReady()
        ? `<p class="callout is-ok">${dnsWaitCopy()} Anschließend auf dieser Seite „DNS prüfen“.</p>`
        : '<p class="callout is-warn">Ohne diese Einträge beim Domain-Anbieter können Zertifikate nicht erstellt werden.</p>';
    }
    return mailIsReady()
      ? `<p class="callout is-ok">${dnsWaitCopy()} ${continueHttpsLaterCopy()}</p>`
      : '<p class="callout is-warn">Ohne diese Einträge beim Domain-Anbieter können Zertifikate nicht erstellt werden.</p>';
  }
  if (state.view === 'network') {
    return mailIsReady()
      ? `<p class="callout is-ok">${dnsWaitCopy()} Anschließend auf dieser Seite „DNS prüfen“.</p>`
      : '<p class="callout is-warn">Ohne Mail an Praxis Flow gibt es kein Zertifikat.</p>';
  }
  return mailIsReady()
    ? `<p class="callout is-ok">${dnsWaitCopy()} ${continueHttpsLaterCopy()}</p>`
    : '<p class="callout is-warn">Ohne diese Mail an Praxis Flow gibt es kein Zertifikat. Weiter ist erst nach dem Haken frei.</p>';
}

function renderMailReplay() {
  if (isOwnDomain(state.nameMode)) {
    return `<details class="network-mail-replay">
      <summary>DNS-Records anzeigen</summary>
      <textarea class="mail-body" id="practice-dns-body" readonly>${escapeHtml(practiceDnsBody())}</textarea>
      <div class="actions-row">
        <button type="button" class="btn-secondary" id="copy-practice-dns">In Zwischenablage kopieren</button>
      </div>
      <p class="hint" id="copy-dns-status" hidden></p>
    </details>`;
  }
  return `<details class="network-mail-replay">
      <summary>Mailtext anzeigen</summary>
      <label class="wizard-field-label">An</label>
      <input class="wizard-input" readonly value="${escapeHtml(OPERATOR_MAIL)}" />
      <label class="wizard-field-label">Mailtext</label>
      <textarea class="mail-body" id="mail-body" readonly>${escapeHtml(operatorBody())}</textarea>
      <div class="actions-row">
        <a class="btn-secondary" href="${mailHref()}">Mail öffnen</a>
        <button type="button" class="btn-secondary" id="copy-mail">In Zwischenablage kopieren</button>
      </div>
    </details>`;
}

// ---------------------------------------------------------------------------
// NetworkView — HTTPS follow-up. POST /host/network stays HTTP-only.
// API sequence: prepare → verify-dns → obtain-certificate → apply
// ---------------------------------------------------------------------------

function renderTlsFollowup(includeLead = true) {
  const verified = state.diagnose === 'ok';
  const afterCert = verified
    ? `<p class="callout is-ok">Die HTTPS-Adresse zeigt auf diesen Rechner.</p>
    <p class="callout is-warn">Auf HTTPS umstellen ist unwiderruflich. Alte HTTP-Adressen und Anmeldungen gelten danach nicht mehr. TV und Tablets danach neu eintragen. Nicht in der Mittagssprechstunde.</p>
    <div class="actions-row">
      <button type="button" id="tls-cutover">Auf HTTPS umstellen</button>
    </div>`
    : '';
  return `${includeLead ? `<p class="wizard-step-lead">${dnsWaitCopy()}</p>` : ''}
    ${verified ? '' : checklist(diagnoseItems({ ipv4Reserved: state.ipv4Reserved, dnsVerified: verified }))}
    ${
      verified
        ? ''
        : `<div class="network-config-actions">
      <button type="button" id="verify-dns">DNS prüfen</button>
    </div>
    <p class="hint">„DNS prüfen“ sieht nur den öffentlichen Eintrag von diesem Rechner aus — nicht TV oder Tablet.</p>`
    }
    ${afterCert}`;
}

function networkStartPhase() {
  return ['hostname', 'lease', 'mail'].includes(state.tlsPhase);
}

function renderReachability() {
  if (state.tlsApplied) {
    return '';
  }
  const locked = state.ipv4Reserved;
  return `<section class="network-config-block">
      <h3 class="network-config-subheading">Vorläufige Geräte-URL (über die IP)</h3>
      <fieldset class="wizard-fieldset">
        <label class="wizard-radio"><input type="radio" checked disabled /> LAN-IP <code>${escapeHtml(httpBase())}</code></label>
        <label class="wizard-radio"><input type="radio" disabled /> Rechnernamen versuchen (.local)</label>
        <label class="wizard-radio"><input type="radio" disabled /> Eigener Hostname / Domain</label>
      </fieldset>
      ${
        locked
          ? `<p class="hint">Geplante HTTPS-Adresse (noch nicht nutzbar): <code>https://${escapeHtml(hostname())}</code>. .local und eigene Domain hier nicht wählbar.</p>`
          : `<p class="hint">Bis HTTPS steht, bleibt die vorläufige Adresse die LAN-IP.</p>`
      }
    </section>`;
}

function renderHttpSave() {
  if (state.tlsApplied) {
    return '';
  }
  const locked = state.ipv4Reserved || (networkStartPhase() && state.view === 'network');
  return `<section class="network-config-block">
      <h3 class="network-config-subheading">Proxy</h3>
      <label class="wizard-checkbox">
        <input type="checkbox" id="proxy-enabled" ${state.proxyEnabled ? 'checked' : ''} ${locked ? 'disabled' : ''} />
        <span>Proxy aktivieren / deaktivieren</span>
      </label>
      <div class="actions-row">
        <button type="button" class="btn-secondary" id="apply-http">Proxy speichern</button>
      </div>
      ${
        locked
          ? '<p class="hint">Der Proxy bleibt an, solange HTTPS vorbereitet oder aktiv ist.</p>'
          : state.httpSaveNotice
            ? '<p class="callout is-ok">Gespeichert: LAN-IP und Proxy. HTTPS ändert sich dadurch nicht.</p>'
            : state.proxyEnabled
              ? '<p class="hint">Speichert nur den Proxy. Das Umstellen auf HTTPS ist ein eigener Schritt oben.</p>'
              : `<p class="hint">${noProxyHttpsWarning()}</p>`
      }
    </section>`;
}

function renderNetworkTls() {
  if (state.tlsApplied) {
    const base = `https://${hostname()}`;
    const host = hostname();
    const fallback = rebindFallback(state.nameMode, host);
    const rebindText = `Ein Gerät im LAN löst die HTTPS-Adresse nicht auf (typisch Fritzbox-Rebind). Ausnahme nur für <code>${escapeHtml(host)}</code> — den Schutz nicht global abschalten. Wenn der Router keine exakte Ausnahme kann: <code>${escapeHtml(fallback)}</code>.`;
    return `<section class="network-config-block" id="https-section">
        <h3 class="network-config-subheading">HTTPS</h3>
        <p class="callout is-ok">Geräte nutzen <code>${escapeHtml(base)}</code>. Proxy nur Weiterleitung.</p>
        <p class="wizard-step-lead">Diese Adressen ersetzen die alten HTTP-Lesezeichen und Anmeldungen:</p>
        <ul class="device-urls-list">${deviceUrlItems(base)}</ul>
        <h3 class="network-config-subheading">Auf einem zweiten Gerät prüfen</h3>
        <label class="wizard-checkbox">
          <input type="checkbox" id="second-device" ${state.secondDeviceOk ? 'checked' : ''} />
          <span>Auf einem zweiten LAN-Gerät geöffnet: <code>${escapeHtml(base)}</code> lädt ohne Zertifikatswarnung.</span>
        </label>
        ${state.rebindHint ? `<p class="callout is-bad">${rebindText}</p>` : ''}
        <div class="actions-row">
          <button type="button" class="btn-secondary" id="verify-fail">HTTPS-Adresse auf einem Gerät nicht auflösbar</button>
        </div>
      </section>`;
  }
  if (networkStartPhase() && !mailIsReady()) {
    const nextDisabled = wizardNextDisabled(WIZARD_STEP.https, state.tlsPhase, {
      nameOk: nameOk(),
      ipv4Reserved: state.ipv4Reserved,
      mailIsReady: mailIsReady(),
    });
    return `<section class="network-config-block" id="https-section">
        <h3 class="network-config-subheading">HTTPS vorbereiten</h3>
        <p class="callout is-warn">Einstieg unter Netzwerk, weil der Assistent „Später“ gewählt hat. Nicht den Assistenten erneut öffnen.</p>
        ${renderTls()}
        <div class="network-config-actions">
          <button type="button" class="btn-link" id="network-tls-back">Zurück</button>
          <button type="button" id="network-tls-next" ${nextDisabled ? 'disabled' : ''}>Weiter</button>
        </div>
      </section>`;
  }
  if (state.ipv4Reserved) {
    return `<section class="network-config-block" id="https-section">
        <h3 class="network-config-subheading">HTTPS</h3>
        <p class="host-preview">https://${escapeHtml(hostname())}</p>
        <p class="wizard-step-lead">${dnsWaitCopy()}</p>
        ${renderTlsFollowup(false)}
        ${renderMailReplay()}
      </section>`;
  }
  if (!httpsEligible(state.proxyEnabled)) {
    return `<section class="network-config-block" id="https-section">
      <h3 class="network-config-subheading">HTTPS</h3>
      <p class="callout is-warn">${noProxyHttpsWarning()}</p>
    </section>`;
  }
  return `<section class="network-config-block" id="https-section">
      <h3 class="network-config-subheading">HTTPS</h3>
      <p class="hint">Noch nicht vorbereitet. HTTPS hier vorbereiten — nicht in den Assistenten zurück.</p>
      <button type="button" id="start-tls-network">HTTPS vorbereiten</button>
    </section>`;
}

function renderLanBlock() {
  const host = `<section class="network-config-block">
      <h3 class="network-config-subheading">Host im Praxisnetz</h3>
      <p class="host-preview">${escapeHtml(lanIp())} · ${escapeHtml(selectedLan().iface)} <span class="radio-meta">MAC ${escapeHtml(selectedLan().mac)}</span></p>
    </section>`;
  if (state.tlsApplied) {
    return host;
  }
  const rest = `${host}${renderHttpSave()}${renderReachability()}`;
  if (tlsIncomplete()) {
    return `<details class="network-lan-details"><summary>LAN und Proxy — läuft bereits</summary>${rest}</details>`;
  }
  return rest;
}

function renderNetwork() {
  return `<header class="app-header"><h1>Netzwerk</h1></header>
    ${mockNav('network')}
    ${renderNetworkTls()}
    ${renderLanBlock()}`;
}

// ---------------------------------------------------------------------------
// StatusView / SetupEntry — open TLS is not missing Docker. CTA → Network.
// Health header stays Betrieb while HTTP runs.
// ---------------------------------------------------------------------------

function mockNav(active) {
  const tabs = [
    ['status', 'Status'],
    ['network', 'Netzwerk'],
    ['maintenance', 'Wartung'],
    ['wizard', 'Assistent'],
  ];
  const wizardLocked = state.view !== 'wizard';
  return `<nav class="main-nav" aria-label="Hauptnavigation">${tabs
    .map(([id, label]) => {
      const disabled = id === 'maintenance' || (id === 'wizard' && wizardLocked);
      return `<button type="button" class="main-nav-tab${
        active === id ? ' is-active' : ''
      }" data-mock-view="${id}" ${disabled ? 'disabled' : ''}>${label}</button>`;
    })
    .join('')}</nav>`;
}

function renderStatus() {
  const pending = tlsIncomplete();
  const active = state.tlsApplied;
  const access = accessBase();
  const proxyLabel = state.proxyEnabled
    ? active
      ? 'Läuft · HTTPS (Proxy nur Weiterleitung)'
      : 'Läuft · Proxy'
    : 'Aus';
  const card = pending
    ? `<section class="setup-entry">
        <p class="setup-entry-eyebrow">HTTPS</p>
        <h1>HTTPS wartet auf DNS</h1>
        <p class="setup-entry-copy">${dnsWaitCopy()} ${continueHttpsLaterCopy()} Fortsetzen unter <strong>Netzwerk</strong>.</p>
        <p class="setup-entry-note">Den Manager schließen ist in Ordnung. Nicht zurück in den Assistenten.</p>
        <button type="button" class="setup-entry-start" id="resume-tls">Fortsetzen</button>
      </section>`
    : active
      ? `<p class="callout is-ok">Geräte nutzen <code>https://${escapeHtml(hostname())}</code>. Proxy nur Weiterleitung.</p>
        <p class="callout is-warn">Alte HTTP-Adressen und Anmeldungen gelten nicht mehr. TV und Tablets mit den Adressen unten neu eintragen.</p>`
      : httpsEligible(state.proxyEnabled)
        ? `<section class="setup-entry">
        <p class="setup-entry-eyebrow">HTTPS</p>
        <h1>Noch nicht vorbereitet</h1>
        <p class="setup-entry-copy">Einstieg unter <strong>Netzwerk</strong> — nicht zurück in den Assistenten.</p>
        <button type="button" class="setup-entry-start" id="resume-tls">Unter Netzwerk beginnen</button>
      </section>`
        : `<section class="setup-entry">
        <p class="setup-entry-eyebrow">HTTPS</p>
        <h1>Noch nicht vorbereitet</h1>
        <p class="setup-entry-copy">${noProxyHttpsWarning()}</p>
        <button type="button" class="setup-entry-start" id="resume-tls">Fortsetzen</button>
      </section>`;
  const urlHeading = active
    ? 'Diese Adressen ersetzen die alten HTTP-Lesezeichen'
    : 'Vorläufige Geräte-URLs (über die IP)';
  const httpsLine = pending
    ? `wartet auf DNS · ${escapeHtml(hostname())}`
    : active
      ? `aktiv · ${escapeHtml(hostname())}`
      : 'nicht begonnen';
  return `<header class="app-header"><h1>Status</h1></header>
    <p class="health-banner is-ok">Betrieb</p>
    ${mockNav('status')}
    ${card}
    <dl class="status-grid">
      <dt>Zugriff</dt><dd>${escapeHtml(access)}</dd>
      <dt>Gerätezugriff</dt><dd>${proxyLabel}</dd>
      <dt>LAN-Adresse</dt><dd>${escapeHtml(lanIp())}</dd>
      <dt>HTTPS</dt><dd>${httpsLine}</dd>
    </dl>
    <section class="device-urls">
      <h2>${urlHeading}</h2>
      <ul class="device-urls-list">${deviceUrlItems(access)}</ul>
    </section>`;
}

function renderActions() {
  const backHidden = wizardBackHidden(state.step);
  const label = wizardNextLabel(state.step, {
    proxyEnabled: state.proxyEnabled,
    httpsPhase: state.tlsPhase,
  });
  document.getElementById('wizard-actions').innerHTML = `
    <button type="button" class="btn-link" id="wizard-back" ${backHidden ? 'hidden' : ''}>Zurück</button>
    <button type="button" id="wizard-next">${label}</button>
  `;
}

function applyFlowAction(action) {
  if (action.type === 'blocked' || action.type === 'stay') {
    return;
  }
  if (action.type === 'complete') {
    goStatus();
    return;
  }
  if (action.type === 'https-phase') {
    goTls(action.phase);
    return;
  }
  if (action.type === 'goto') {
    go(action.step);
  }
}

const JUMPS = [
  ['Wizard Netzwerk', () => go(WIZARD_STEP.network)],
  ['Zugang / Proxy', () => go(WIZARD_STEP.access)],
  ['HTTPS Angebot', () => goTls('offer')],
  ['Hostname', () => goTls('hostname')],
  [
    'Eigene Domain',
    () => {
      state.nameMode = NAME_MODE.domain;
      state.customDomain = 'flow.praxis-meyer.de';
      goTls('hostname');
    },
  ],
  ['Feste IP', () => goTls('lease')],
  [
    'Mail',
    () => {
      state.ipv4Reserved = true;
      goTls('mail');
    },
  ],
  [
    'Vorschau',
    () => {
      state.ipv4Reserved = true;
      markMailPrepared();
      go(WIZARD_STEP.preview);
    },
  ],
  ['Abschluss', () => go(WIZARD_STEP.apply)],
  [
    'Status · wartet auf DNS',
    () => {
      state.ipv4Reserved = true;
      markMailPrepared();
      state.diagnose = null;
      state.tlsApplied = false;
      goStatus();
    },
  ],
  [
    'Netzwerk · Auftrag',
    () => {
      state.ipv4Reserved = true;
      markMailPrepared();
      state.diagnose = null;
      state.tlsApplied = false;
      goNetwork();
    },
  ],
  [
    'Netzwerk · DNS grün',
    () => {
      state.ipv4Reserved = true;
      markMailPrepared();
      state.diagnose = 'ok';
      state.tlsApplied = false;
      goNetwork();
    },
  ],
  [
    'Netzwerk · ohne HTTPS',
    () => {
      state.ipv4Reserved = false;
      state.mailSent = false;
      state.mailAck = false;
      state.practiceDnsAck = false;
      state.mailNotedAt = '';
      state.diagnose = null;
      state.tlsApplied = false;
      state.tlsPhase = 'offer';
      state.proxyEnabled = true;
      goNetwork();
    },
  ],
  [
    'Ohne Proxy',
    () => {
      state.ipv4Reserved = false;
      state.mailAck = false;
      state.tlsApplied = false;
      state.proxyEnabled = false;
      go(WIZARD_STEP.access);
    },
  ],
  [
    'Status · HTTPS aktiv',
    () => {
      state.ipv4Reserved = true;
      markMailPrepared();
      state.diagnose = 'ok';
      state.tlsApplied = true;
      goStatus();
    },
  ],
  [
    'Netzwerk · nach Umstellen',
    () => {
      state.ipv4Reserved = true;
      markMailPrepared();
      state.diagnose = 'ok';
      state.tlsApplied = true;
      goNetwork();
    },
  ],
];

function renderJumps() {
  document.getElementById('mock-jumps').innerHTML = JUMPS.map(
    (entry, index) =>
      `<button type="button" class="btn-secondary" data-jump="${index}">${entry[0]}</button>`,
  ).join('');
}

function go(step) {
  state.view = 'wizard';
  state.step = step;
  render();
}

function goTls(phase) {
  state.view = 'wizard';
  state.step = WIZARD_STEP.https;
  state.tlsPhase = phase;
  render();
}

function goStatus() {
  state.view = 'status';
  render();
}

function goNetwork() {
  state.view = 'network';
  render();
}

function goBack() {
  applyFlowAction(planWizardBack(state.step, state.tlsPhase, flowCtx()));
}

function goNext() {
  const offerLater =
    state.step === WIZARD_STEP.https &&
    state.tlsPhase === 'offer' &&
    document.querySelector('input[name="tls-offer"]:checked')?.value === 'later';
  applyFlowAction(planWizardNext(state.step, state.tlsPhase, flowCtx({ offerLater })));
}

function syncNextDisabled() {
  const next = document.getElementById('wizard-next');
  if (!next) {
    return;
  }
  next.disabled = wizardNextDisabled(state.step, state.tlsPhase, {
    nameOk: nameOk(),
    ipv4Reserved: state.ipv4Reserved,
    mailIsReady: mailIsReady(),
  });
}

function updateHostnamePreview() {
  const preview = document.querySelector('.host-preview');
  if (preview) {
    preview.textContent = `https://${hostname()}`;
  }
  const input = document.getElementById('custom-label') || document.getElementById('custom-domain');
  const bad =
    input?.parentElement?.querySelector('.callout.is-bad') ??
    document.querySelector('#step-body .callout.is-bad');
  const invalid =
    (state.nameMode === NAME_MODE.label || state.nameMode === NAME_MODE.domain) && !nameOk();
  const message =
    state.nameMode === NAME_MODE.domain
      ? 'Voller Hostname mit Punkt, z. B. flow.praxis-meyer.de — nicht unter lan.notaus.de.'
      : 'Nur a–z, 0–9, Bindestrich; nicht lan/acme/www/portal/mail.';
  if (invalid) {
    if (!bad && input) {
      input.insertAdjacentHTML('afterend', `<p class="callout is-bad">${message}</p>`);
    }
  } else {
    bad?.remove();
  }
  syncNextDisabled();
}

async function copyText(text, statusId) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    document.execCommand('copy');
  }
  const status = document.getElementById(statusId);
  if (status) {
    status.hidden = false;
    status.textContent = 'Kopiert.';
  }
}

document.body.addEventListener('click', (event) => {
  const jump = event.target.closest('[data-jump]');
  if (jump) {
    JUMPS[Number(jump.dataset.jump)][1]();
    return;
  }
  const mockView = event.target.closest('[data-mock-view]');
  if (mockView) {
    const id = mockView.dataset.mockView;
    if (id === 'status') {
      goStatus();
    } else if (id === 'network') {
      goNetwork();
    } else if (id === 'wizard') {
      go(WIZARD_STEP.preview);
    }
    return;
  }
  const button = event.target.closest('button');
  if (!button) {
    return;
  }
  if (button.id === 'wizard-back') {
    goBack();
    return;
  }
  if (button.id === 'wizard-next') {
    goNext();
    return;
  }
  if (button.id === 'resume-tls') {
    goNetwork();
    return;
  }
  if (button.id === 'start-tls-network') {
    if (!httpsEligible(state.proxyEnabled)) {
      return;
    }
    state.tlsPhase = 'hostname';
    render();
    return;
  }
  if (button.id === 'network-tls-next') {
    const action = planNetworkTlsNext(state.tlsPhase, flowCtx());
    if (action.type === 'https-phase') {
      state.tlsPhase = action.phase;
    }
    render();
    return;
  }
  if (button.id === 'network-tls-back') {
    state.tlsPhase = planNetworkTlsBack(state.tlsPhase);
    render();
    return;
  }
  if (button.id === 'apply-http') {
    state.httpSaveNotice = true;
    render();
    return;
  }
  if (button.id === 'tls-cutover') {
    if (state.diagnose !== 'ok') {
      return;
    }
    state.tlsApplied = true;
    render();
    return;
  }
  if (button.id === 'copy-practice-dns') {
    void copyText(practiceDnsBody(), 'copy-dns-status');
    return;
  }
  if (button.id === 'copy-mail') {
    state.mailSent = true;
    void copyText(operatorBody());
    return;
  }
  if (button.id === 'verify-dns') {
    state.diagnose = 'ok';
    render();
    return;
  }
  if (button.id === 'verify-fail') {
    state.rebindHint = true;
    state.secondDeviceOk = false;
    render();
  }
});

document.body.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  if (target.id === 'proxy-enabled') {
    state.proxyEnabled = target.checked;
    render();
    return;
  }
  if (target.name === 'lan-ip') {
    state.lanIndex = Number(target.value);
    render();
    return;
  }
  if (target.id === 'ipv4-reserved') {
    state.ipv4Reserved = target.checked;
    if (state.view === 'network') {
      render();
      return;
    }
    syncNextDisabled();
    return;
  }
  if (target.id === 'mail-ack') {
    state.mailAck = target.checked;
    if (state.mailAck && !state.mailNotedAt) {
      state.mailNotedAt = '25.08.2026';
    }
    render();
    return;
  }
  if (target.id === 'practice-dns-ack') {
    state.practiceDnsAck = target.checked;
    render();
    return;
  }
  if (target.id === 'second-device') {
    state.secondDeviceOk = target.checked;
    return;
  }
  if (target.name === 'name-mode') {
    state.nameMode = target.value;
    render();
  }
});

document.body.addEventListener('input', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  if (target.id === 'custom-label') {
    state.customLabel = target.value;
    if (state.view === 'network') {
      render();
      return;
    }
    updateHostnamePreview();
    return;
  }
  if (target.id === 'custom-domain') {
    state.customDomain = target.value;
    if (state.view === 'network') {
      render();
      return;
    }
    updateHostnamePreview();
  }
});

function render() {
  document.querySelector('.app-shell').dataset.tlsState = tlsState();
  const wizard = document.getElementById('wizard-shell');
  const status = document.getElementById('status-shell');
  const network = document.getElementById('network-shell');
  wizard.hidden = state.view !== 'wizard';
  status.hidden = state.view !== 'status';
  network.hidden = state.view !== 'network';
  if (state.view === 'status') {
    status.innerHTML = renderStatus();
    return;
  }
  if (state.view === 'network') {
    network.innerHTML = renderNetwork();
    return;
  }
  document.getElementById('step-title').textContent = WIZARD_STEP_TITLES[state.step];
  document.getElementById('step-body').innerHTML = renderBody();
  renderSteps();
  renderActions();
  syncNextDisabled();
}

renderJumps();
render();
