/**
 * LAN-TLS wizard mock — DOM only.
 *
 * Model / flow: ./tls-model.js (lift that first).
 * Existing Manager surfaces to extend:
 *   WizardStepIndicator.svelte  — HTTPS dots while step 6 is current
 *   WizardSteps.svelte          — new case for step 6 (HTTPS phases)
 *   wizard-flow.ts              — planWizardNext / skip HTTPS without proxy
 *   NetworkView.svelte / ReachabilityPanel.svelte — HTTPS follow-up; do not put TLS in POST /host/network
 *   network-controller.ts + Setup host-state/proxy — preserve active TLS on LAN-only saves
 *     OPEN: guest-WLAN / Private-DNS copy in expander "Adresse für Terminal, TV und MFA" (also without TLS)
 *   StatusView.svelte / SetupEntry.svelte — awaiting-dns card → Network tab
 *   BackupPanel.svelte / RestoreWizardDialog.svelte — sidecar + inspect line, no second wizard
 *     Gate: tls-model tlsRestoreSupported → inspectPfbackup; unpack in settings-backup-restore.ts
 *
 * German copy stays here. Logic stays in tls-model.js.
 */

const {
  CERT_PHASE,
  EXPIRY_KIND,
  HTTPS_PHASES,
  NAME_MODE,
  OPERATOR_MAIL,
  OPERATOR_ZONE,
  SAMPLE,
  WIZARD_MOCK_FIRST,
  WIZARD_STEP,
  WIZARD_STEP_LABELS,
  WIZARD_STEP_TITLES,
  canApplyTls,
  canObtainCertificate,
  canonicalOrigin,
  certNotAfterLabel,
  deriveTlsState,
  devicePaths,
  diagnoseItems,
  hostnameOf,
  httpOrigin,
  httpsEligible,
  httpsPhaseIndex,
  isCustomCert,
  isOwnDomain,
  localCertChecks,
  mailReady,
  mailtoHref,
  nameValid,
  operatorMailSubject,
  operatorZoneMailBody,
  planNetworkTlsBack,
  planNetworkTlsNext,
  planWizardBack,
  planWizardNext,
  practiceARecordBody,
  rebindFallback,
  tokenConsumed,
  tlsBackupMetadataConsistent,
  tlsErrorCopy,
  tlsInBackup,
  tlsInspectLine,
  tlsPreparedInBackup,
  tlsRestoreBlockedCopy,
  tlsRestoreSupported,
  tlsRestoreWarningCopy,
  tlsSidecarFileName,
  tlsSidecarMatches,
  wizardBackHidden,
  wizardNextDisabled,
  wizardNextLabel,
} = globalThis.LanTlsModel;

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
  pemAck: false,
  mailNotedAt: '',
  secondDeviceOk: false,
  diagnose: null,
  rebindHint: false,
  tlsApplied: false,
  httpSaveNotice: false,
  certPhase: CERT_PHASE.none,
  errorClass: null,
  expiryKind: EXPIRY_KIND.ok,
  checksOk: true,
  lanIpStale: false,
  sidecarSaved: false,
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
    pemAck: state.pemAck,
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

function certReady() {
  return state.certPhase === CERT_PHASE.ready || state.tlsApplied;
}

function tokenIsConsumed() {
  return tokenConsumed({ certReady: certReady(), tlsActive: state.tlsApplied });
}

function tlsState() {
  return deriveTlsState({
    ipv4Reserved: state.ipv4Reserved,
    mailPrepared: mailIsReady(),
    dnsVerified: state.diagnose === 'ok',
    obtainingCert: state.certPhase === CERT_PHASE.obtaining,
    certReady: state.certPhase === CERT_PHASE.ready,
    tlsActive: state.tlsApplied,
    degraded: state.tlsApplied && (state.expiryKind === EXPIRY_KIND.soon || state.lanIpStale),
    hasError:
      state.certPhase === CERT_PHASE.error ||
      (state.tlsApplied && state.expiryKind === EXPIRY_KIND.expired),
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
  return operatorZoneMailBody({
    hostname: hostname(),
    lanIp: lanIp(),
    tokenConsumed: tokenIsConsumed(),
  });
}

function practiceDnsBody() {
  return practiceARecordBody({ hostname: hostname(), lanIp: lanIp() });
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
    state.pemAck = true;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function notice(kind, html, tag = 'p') {
  return `<${tag} class="notice is-${kind}">${html}</${tag}>`;
}

function networkBlock(heading, content, attrs = '') {
  const attr = attrs ? ` ${attrs}` : '';
  const head = heading ? `<h3 class="network-config-subheading">${heading}</h3>` : '';
  return `<section class="network-config-block"${attr}>${head}${content}</section>`;
}

function httpsSection(heading, content) {
  return networkBlock(heading, content, 'id="https-section"');
}

function networkActions(html) {
  return `<div class="network-config-actions">${html}</div>`;
}

function deviceUrlItems(base) {
  return devicePaths()
    .map(
      ([label, path]) =>
        `<li class="device-url-item"><span>${label}</span><code>${escapeHtml(base)}${path}</code></li>`,
    )
    .join('');
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
    if (id < WIZARD_MOCK_FIRST) {
      return [];
    }
    const skipped = id === WIZARD_STEP.https && skippedHttps;
    const cls = skipped
      ? 'is-upcoming'
      : id === current
        ? 'is-current'
        : id < current
          ? 'is-done'
          : 'is-upcoming';
    const phaseHere =
      id === WIZARD_STEP.https && httpsOpen ? httpsPhaseIndex(state.tlsPhase) + 1 : 0;
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
    const sep =
      id > WIZARD_MOCK_FIRST ? '<li class="wizard-step-separator" aria-hidden="true">›</li>' : '';
    return [sep, item];
  }).join('');
}

// ---------------------------------------------------------------------------
// WizardSteps.svelte — mock scope: steps 4–8 (network … apply); HTTPS = new case
// ---------------------------------------------------------------------------

function renderBody() {
  const step = state.step;
  if (step === WIZARD_STEP.network) {
    const selected = selectedLan();
    return `<p class="wizard-step-lead">Unter welcher Adresse soll Praxis Flow im Praxisnetz erreichbar sein? HTTPS kommt später, nicht hier.</p>
      ${networkBlock(
        'Host im Praxisnetz',
        `<p class="hint">${SAMPLE.lan.length} Adressen gefunden.</p>
        <fieldset class="wizard-fieldset">
          ${SAMPLE.lan
            .map(
              (item, index) => `<label class="wizard-radio">
              <input type="radio" name="lan-ip" value="${index}" ${state.lanIndex === index ? 'checked' : ''} />
              <span>
                <strong>${escapeHtml(item.address)}</strong>
                <span class="hint">${escapeHtml(item.iface)} · MAC ${escapeHtml(item.mac)}</span>
              </span>
            </label>`,
            )
            .join('')}
        </fieldset>
        <p class="hint">Vorläufige Geräte-Adresse: <code>${escapeHtml(selected.address)}</code></p>`,
      )}`;
  }

  if (step === WIZARD_STEP.access) {
    return `<p class="wizard-step-lead">Mit Proxy kann Praxis Flow nativ über Port 80 im Browser angesprochen werden. Zudem ist der Proxy Voraussetzung für die spätere HTTPS-Nutzung.</p>
      ${networkBlock(
        '',
        `<label class="wizard-checkbox">
          <input type="checkbox" id="proxy-enabled" ${state.proxyEnabled ? 'checked' : ''} ${state.ipv4Reserved ? 'disabled' : ''} />
          <span>Proxy aktivieren / deaktivieren</span>
        </label>
        <p class="hint">Vorläufig: <code>${escapeHtml(httpBase())}</code></p>
        ${state.proxyEnabled ? '' : notice('warn', noProxyHttpsWarning())}`,
      )}`;
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
          ? notice(
              'warn',
              `Geplante HTTPS-Adresse (noch nicht nutzbar): <code>https://${escapeHtml(hostname())}</code>. Bis dahin über die IP. HTTPS später unter Netzwerk.`,
            )
          : httpsEligible(state.proxyEnabled)
            ? notice(
                'warn',
                'HTTPS ist nicht vorbereitet. Weitere Einrichtung jetzt über die IP. Später unter Netzwerk.',
              )
            : notice('warn', noProxyHttpsWarning())
      }`;
  }

  if (step === WIZARD_STEP.apply) {
    const httpsNote = state.ipv4Reserved
      ? `<p>HTTPS später unter Netzwerk. ${dnsWaitCopy()}</p>`
      : httpsEligible(state.proxyEnabled)
        ? '<p>HTTPS später unter Netzwerk.</p>'
        : notice('warn', noProxyHttpsWarning());
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
          <span class="lan-ip-status-value">${escapeHtml(selectedLan().iface)} <span class="hint">MAC ${escapeHtml(selectedLan().mac)}</span></span>
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
      ${notice('warn', 'Keine Portfreigabe im Router einrichten. Praxis Flow und das Portal sind nur fürs Praxisnetz gedacht — nicht für den Zugriff aus dem Internet.')}`;
  }

  if (phase === 'mail') {
    return isCustomCert(state.nameMode)
      ? `${renderPemTask()}${mailContinueHint()}`
      : `${renderMailTask()}${mailContinueHint()}`;
  }

  return mailContinueHint();
}

function renderHostnamePhase() {
  const mode = state.nameMode;
  const extra =
    mode === NAME_MODE.label
      ? `<div class="wizard-nested">
            <label class="wizard-field-label" for="custom-label">Label</label>
            <input id="custom-label" class="wizard-input" maxlength="63" value="${escapeHtml(state.customLabel)}" placeholder="seidel" />
            ${nameOk() ? '' : notice('bad', 'DNS-Label: a–z, 0–9, Bindestrich, 1–63 Zeichen; nicht am Rand Bindestrich; keine Umlaute; nicht lan/acme/www/portal/mail.')}
            <p class="hint">Wunschname in derselben Zone wie der Vorschlag.</p>
          </div>`
      : mode === NAME_MODE.domain
        ? `<div class="wizard-nested">
            <label class="wizard-field-label" for="custom-domain">Adresse (ohne https://)</label>
            <input id="custom-domain" class="wizard-input" value="${escapeHtml(state.customDomain)}" placeholder="flow.praxis-meyer.de" />
            ${nameOk() ? '' : notice('bad', 'Voller Name mit Punkt, z. B. flow.praxis-meyer.de — nicht unter lan.notaus.de.')}
            <p class="hint">Eine Domain, die Sie selbst verwalten. Zertifikat als PEM einlesen — nur A-Record, kein ACME.</p>
          </div>`
        : `<div class="wizard-nested">
            <p class="hint">Ein anonymer Name bei öffentlichen DNS-Servern, abgeleitet aus einer internen Installations-ID.</p>
          </div>`;
  return `<p class="wizard-step-lead">Das wird die neue HTTPS-Adresse für den Zugriff auf Praxis Flow.</p>
      <p class="hint hint--preview">HTTPS-Adresse <code id="hostname-preview">https://${escapeHtml(hostname())}</code></p>
      <fieldset class="wizard-fieldset">
        <label class="wizard-radio">
          <input type="radio" name="name-mode" value="${NAME_MODE.generated}" ${mode === NAME_MODE.generated ? 'checked' : ''} />
          <span>
            <strong>Vorschlag</strong>
            <span class="hint">6 Zeichen unter <code>${OPERATOR_ZONE}</code></span>
          </span>
        </label>
        ${mode === NAME_MODE.generated ? extra : ''}
        <label class="wizard-radio">
          <input type="radio" name="name-mode" value="${NAME_MODE.label}" ${mode === NAME_MODE.label ? 'checked' : ''} />
          <span>
            <strong>Eigenes Label</strong>
            <span class="hint">ebenfalls <code>*.${OPERATOR_ZONE}</code></span>
          </span>
        </label>
        ${mode === NAME_MODE.label ? extra : ''}
        <label class="wizard-radio">
          <input type="radio" name="name-mode" value="${NAME_MODE.domain}" ${mode === NAME_MODE.domain ? 'checked' : ''} />
          <span>
            <strong>Eigene Domain</strong>
            <span class="hint">eigenes Zertifikat, nur A-Record</span>
          </span>
        </label>
        ${mode === NAME_MODE.domain ? extra : ''}
      </fieldset>`;
}

function renderPemTask() {
  return `<p class="wizard-step-lead">Zertifikat und Schlüssel hier einlesen. Der Manager prüft das Format und überträgt den Inhalt — kein Dateipfad nach Docker.</p>
      <label class="wizard-field-label">Zertifikatskette (PEM)</label>
      <input class="wizard-input" type="file" accept=".pem,.crt,.cer" disabled />
      <label class="wizard-field-label">Privater Schlüssel (PEM)</label>
      <input class="wizard-input" type="file" accept=".pem,.key" disabled />
      <p class="hint">Im Mock keine echte Datei. Im Manager: Main liest und prüft den Inhalt, Setup legt ihn mit Host-ACLs inaktiv im Install-Home ab. Canonical bleibt bis zum Umstellen HTTP.</p>
      <p class="hint">Beim Domain-Anbieter nur den A-Record setzen — kein ACME-CNAME.</p>
      <textarea class="wizard-input is-monospace" readonly>${escapeHtml(practiceDnsBody())}</textarea>
      <label class="wizard-checkbox">
        <input type="checkbox" id="pem-ack" ${state.pemAck ? 'checked' : ''} />
        <span>Format geprüft, Inhalt übernommen (Mock).</span>
      </label>`;
}

function renderMailTask() {
  return `<p class="wizard-step-lead">Basierend auf der zuvor gewählten IP-Adresse und dem Namen richtet Praxis Flow die erforderlichen DNS-Einträge ein, damit das Zertifikat anschließend automatisch ausgestellt und erneuert werden kann. Hierzu senden Sie bitte den nachfolgenden Text an <code>${escapeHtml(OPERATOR_MAIL)}</code>.</p>
      <label class="wizard-field-label">An (Praxis Flow)</label>
      <input class="wizard-input" readonly value="${escapeHtml(OPERATOR_MAIL)}" />
      <label class="wizard-field-label">Betreff</label>
      <input class="wizard-input" readonly value="${escapeHtml(operatorMailSubject(hostname()))}" />
      <label class="wizard-field-label">Mailtext</label>
      <textarea class="wizard-input is-monospace" id="mail-body" readonly>${escapeHtml(operatorBody())}</textarea>
      <div class="actions-row">
        <a class="btn-primary" id="open-mail" href="${mailHref()}">Mail öffnen</a>
        <button type="button" class="btn-secondary" id="copy-mail">In Zwischenablage kopieren</button>
      </div>
      <label class="wizard-checkbox">
        <input type="checkbox" id="mail-ack" ${state.mailAck ? 'checked' : ''} />
        <span>Ich habe die Mail an Praxis Flow (${escapeHtml(OPERATOR_MAIL)}) geschickt.</span>
      </label>`;
}

function mailContinueHint() {
  if (isCustomCert(state.nameMode)) {
    if (!state.pemAck) {
      return notice('warn', 'Ohne geprüftes Zertifikat (PEM) gibt es kein HTTPS.');
    }
    return state.view === 'network'
      ? notice('ok', `${dnsWaitCopy()} Anschließend auf dieser Seite „DNS prüfen“ (nur A-Record).`)
      : notice('ok', `${dnsWaitCopy()} ${continueHttpsLaterCopy()}`);
  }
  if (state.view === 'network') {
    return mailIsReady()
      ? notice('ok', `${dnsWaitCopy()} Anschließend auf dieser Seite „DNS prüfen“.`)
      : notice('warn', 'Ohne Mail an Praxis Flow gibt es kein Zertifikat.');
  }
  return mailIsReady()
    ? notice('ok', `${dnsWaitCopy()} ${continueHttpsLaterCopy()}`)
    : notice(
        'warn',
        'Ohne diese Mail an Praxis Flow gibt es kein Zertifikat. Weiter ist erst nach dem Haken frei.',
      );
}

function renderMailReplay() {
  if (isOwnDomain(state.nameMode)) {
    return `<details>
      <summary>DNS-Records anzeigen</summary>
      <textarea class="wizard-input is-monospace is-compact" id="practice-dns-body" readonly>${escapeHtml(practiceDnsBody())}</textarea>
      <div class="actions-row">
        <button type="button" class="btn-secondary" id="copy-practice-dns">In Zwischenablage kopieren</button>
      </div>
      <p class="hint" id="copy-dns-status" hidden></p>
    </details>`;
  }
  return `<details>
      <summary>Mailtext anzeigen</summary>
      <label class="wizard-field-label">An</label>
      <input class="wizard-input" readonly value="${escapeHtml(OPERATOR_MAIL)}" />
      <label class="wizard-field-label">Mailtext</label>
      <textarea class="wizard-input is-monospace is-compact" id="mail-body" readonly>${escapeHtml(operatorBody())}</textarea>
      <div class="actions-row">
        <a class="btn-secondary" href="${mailHref()}">Mail öffnen</a>
        <button type="button" class="btn-secondary" id="copy-mail">In Zwischenablage kopieren</button>
      </div>
    </details>`;
}

// ---------------------------------------------------------------------------
// NetworkView — HTTPS follow-up. POST /host/network stays HTTP-only.
// Managed: prepare → verify-dns → obtain-certificate → apply
// Custom:  prepare → custom-certificate(stage) → verify-dns → check-certificate → apply
// ---------------------------------------------------------------------------

function portForwardWarning() {
  return notice(
    'warn',
    'Gültiges Zertifikat plus Portweiterleitung 443 legt die ganze App ins Internet. 80 und 443 nicht freigeben.',
  );
}

function renderCertMeta() {
  const notAfter = certNotAfterLabel(state.expiryKind);
  return `<dl class="status-grid wizard-summary-grid">
      <dt>Hostname</dt><dd><code>${escapeHtml(hostname())}</code></dd>
      <dt>Installations-ID</dt><dd><code>${escapeHtml(SAMPLE.installId)}</code></dd>
      <dt>Aussteller</dt><dd>${escapeHtml(
        isCustomCert(state.nameMode) ? SAMPLE.certIssuerCustom : SAMPLE.certIssuer,
      )}</dd>
      <dt>Gültig bis</dt><dd>${escapeHtml(notAfter)}</dd>
    </dl>`;
}

function renderTlsFollowup(includeLead = true) {
  const verified = state.diagnose === 'ok';
  const obtaining = state.certPhase === CERT_PHASE.obtaining;
  const ready = state.certPhase === CERT_PHASE.ready;
  const certError = state.certPhase === CERT_PHASE.error && !state.tlsApplied;
  const dnsList = checklist(
    diagnoseItems({
      ipv4Reserved: state.ipv4Reserved,
      dnsVerified: verified,
      nameMode: state.nameMode,
    }),
  );
  const localList = checklist(
    localCertChecks({
      certReady: ready,
      checksOk: state.checksOk,
      obtainingCert: obtaining,
    }),
  );
  const lead = includeLead ? `<p class="wizard-step-lead">${dnsWaitCopy()}</p>` : '';

  if (certError) {
    const copy = tlsErrorCopy(state.errorClass);
    return `${lead}${dnsList}
      ${notice('bad', escapeHtml(copy.title))}
      <p class="hint">${escapeHtml(copy.action)}</p>
      <div class="actions-row">
        <button type="button" id="tls-repair">Erneut versuchen</button>
        <button type="button" class="btn-secondary" id="tls-reset">HTTPS-Vorbereitung verwerfen</button>
      </div>`;
  }

  if (obtaining) {
    return `${lead}${dnsList}
      ${notice('ok', 'DNS stimmt. Zertifikat wird geholt — HTTP bleibt erreichbar.')}
      ${localList}
      <p class="hint">Geräte-URLs bleiben http://, bis HTTPS übernommen ist. 443 kann intern schon antworten.</p>`;
  }

  if (ready && !state.tlsApplied) {
    const applyOk = canApplyTls({
      ipv4Reserved: state.ipv4Reserved,
      certReady: true,
      checksOk: state.checksOk,
      tlsActive: false,
    });
    return `${lead}${dnsList}${localList}
      ${notice('ok', 'Zertifikat liegt vor. Geräte nutzen noch HTTP.')}
      ${portForwardWarning()}
      ${notice(
        'warn',
        'Auf HTTPS umstellen ist unwiderruflich. Alte HTTP-Adressen und Anmeldungen gelten danach nicht mehr. TV und Tablets danach neu eintragen. Außerhalb der Öffnungszeiten wäre besser.',
      )}
      <div class="actions-row">
        <button type="button" id="tls-cutover" ${applyOk ? '' : 'disabled'}>Auf HTTPS umstellen</button>
      </div>`;
  }

  if (verified) {
    const obtainOk = canObtainCertificate({
      dnsVerified: true,
      obtainingCert: false,
      certReady: false,
      tlsActive: false,
    });
    return `${lead}${dnsList}
      ${notice(
        'ok',
        'Die HTTPS-Adresse zeigt auf diesen Rechner. HTTP bleibt, bis das Zertifikat da ist und HTTPS übernommen wird.',
      )}
      ${networkActions(
        `<button type="button" id="tls-obtain" ${obtainOk ? '' : 'disabled'}>${
          isCustomCert(state.nameMode) ? 'Lokal prüfen' : 'Zertifikat holen'
        }</button>`,
      )}
      <p class="hint">${
        isCustomCert(state.nameMode)
          ? 'PEM liegt vor. Prüft 443, Kette, HTTP/2 und SSE, während HTTP weiterläuft.'
          : 'Holt das Zertifikat, während die Praxis weiter über HTTP arbeitet. Umstellen ist ein eigener Schritt.'
      }</p>`;
  }

  return `${lead}${dnsList}
    ${networkActions('<button type="button" id="verify-dns">DNS prüfen</button>')}
    <p class="hint">„DNS prüfen“ sieht nur den öffentlichen Eintrag von diesem Rechner aus — nicht TV oder Tablet.</p>`;
}

function networkStartPhase() {
  return ['hostname', 'lease', 'mail'].includes(state.tlsPhase);
}

function renderClientReachHint() {
  return `<h4 class="wizard-subheading">Gerät öffnet die Adresse nicht</h4>
      <p class="hint">Terminal, TV und Tablets sind oft im WLAN, der Praxisserver am Kabel. Das gilt schon ohne HTTPS: das Gerät braucht eine Route zum Server, nicht nur „Internet“.</p>
      <p class="hint"><strong>Gast-WLAN.</strong> Viele Router trennen Gäste vom Praxisnetz. Das Gerät kommt ins Internet, nicht zum Server. Ins Praxis-WLAN wechseln (nicht Gast) oder die Praxis-IT lässt den Server im Gastnetz zu.</p>
      <p class="hint"><strong>Privates DNS auf dem Handy.</strong> Android „Privates DNS“, iCloud-Privat-Relay oder ein DNS-Filter umgeht den Router. Dann löst der Name anders auf als bei den anderen Geräten. Für den Test ausschalten oder dasselbe Netz-DNS nutzen.</p>`;
}

function renderReachability() {
  const locked = state.tlsApplied || state.ipv4Reserved;
  return networkBlock(
    'Adresse für Terminal, TV und MFA',
    `<fieldset class="wizard-fieldset">
        <label class="wizard-radio"><input type="radio" checked disabled /> LAN-IP <code>${escapeHtml(httpBase())}</code></label>
        <label class="wizard-radio"><input type="radio" disabled /> Rechnernamen versuchen (.local)</label>
        <label class="wizard-radio"><input type="radio" disabled /> Eigener Hostname / Domain</label>
      </fieldset>
      ${
        state.tlsApplied
          ? `<p class="hint">Geräte nutzen <code>https://${escapeHtml(hostname())}</code>. .local und eigene Domain hier nicht wählbar.</p>`
          : locked
            ? `<p class="hint">Geplante HTTPS-Adresse (noch nicht nutzbar): <code>https://${escapeHtml(hostname())}</code>. .local und eigene Domain hier nicht wählbar.</p>`
            : `<p class="hint">Bis HTTPS steht, bleibt die vorläufige Adresse die LAN-IP.</p>`
      }
      ${renderClientReachHint()}`,
  );
}

function renderHttpSave() {
  if (state.tlsApplied) {
    return '';
  }
  const locked = state.ipv4Reserved || (networkStartPhase() && state.view === 'network');
  return networkBlock(
    'Proxy',
    `<label class="wizard-checkbox">
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
            ? notice('ok', 'Gespeichert: LAN-IP und Proxy. HTTPS ändert sich dadurch nicht.')
            : state.proxyEnabled
              ? '<p class="hint">Speichert nur den Proxy. Das Umstellen auf HTTPS ist ein eigener Schritt oben.</p>'
              : `<p class="hint">${noProxyHttpsWarning()}</p>`
      }`,
  );
}

function renewActionLabel() {
  return isCustomCert(state.nameMode) ? 'Neues Zertifikat einlesen' : 'Jetzt erneuern';
}

function renderExpiryNotice() {
  if (state.expiryKind === EXPIRY_KIND.expired) {
    return `${notice('bad', 'Zertifikat ist abgelaufen und muss jetzt erneuert werden.')}
      <div class="actions-row">
        <button type="button" id="tls-renew">${renewActionLabel()}</button>
      </div>`;
  }
  if (state.expiryKind === EXPIRY_KIND.soon) {
    return `${notice('warn', `Das Zertifikat läuft bald ab (${escapeHtml(SAMPLE.certNotAfterSoon)}).`)}
      <div class="actions-row">
        <button type="button" class="btn-secondary" id="tls-renew">${renewActionLabel()}</button>
      </div>`;
  }
  return '';
}

function renderStaleIp() {
  if (!state.lanIpStale || !state.tlsApplied) {
    return '';
  }
  return networkBlock(
    'LAN-IP weicht ab',
    `${notice(
      'warn',
      'Die aktuelle Adresse dieses Rechners weicht von der im A-Record hinterlegten IP ab. Delegation und Zertifikat bleiben.',
    )}
      <div class="actions-row">
        <button type="button" class="btn-secondary" id="stale-keep">Alte IP behalten</button>
        <button type="button" id="stale-take">Neue IP übernehmen</button>
      </div>
      <p class="hint">Neue IP erzeugt einen Mailtext ohne Token — nur der A-Record ändert sich.</p>`,
  );
}

function renderRebindHint(host, fallback) {
  const safeHost = escapeHtml(host);
  const safeFallback = escapeHtml(fallback);
  return notice(
    'bad',
    `<p><strong>Der Name kommt auf diesem Gerät nicht an</strong></p>
      <p>Dieser Rechner und das Zertifikat sind in Ordnung. Ein anderes Gerät im Praxisnetz fragt nach <code>${safeHost}</code> und bekommt keine Adresse — viele Router und DNS-Filter blockieren Internet-Namen, die auf eine Adresse im eigenen Netz zeigen (DNS-Rebinding-Schutz).</p>
      <ol>
        <li>Im Router oder DNS-Filter eine <strong>Ausnahme nur für</strong> <code>${safeHost}</code> eintragen (Suchbegriffe: Rebind, DNS-Rebinding, lokale Namen, private IP).</li>
        <li>Geht keine exakte Ausnahme: kleinste Zone <code>${safeFallback}</code>, nicht das ganze Netz.</li>
        <li>Den Schutz <strong>nicht</strong> global abschalten.</li>
        <li>Das betroffene Gerät kurz vom WLAN trennen und <code>https://${safeHost}</code> erneut öffnen.</li>
      </ol>
      <p>Wenn der Server aus einem WLAN nicht erreichbar ist, prüfen Sie bitte auf Ihrem Router, ob Netzwerkzugriffe zwischen WLAN und LAN bzw. zwischen Geräten im WLAN erlaubt sind.</p>`,
    'div',
  );
}

function renderNetworkTls() {
  if (state.tlsApplied) {
    const base = `https://${hostname()}`;
    const host = hostname();
    const fallback = rebindFallback(state.nameMode, host);
    return `${httpsSection(
      'HTTPS',
      `${notice('ok', `Geräte nutzen <code>${escapeHtml(base)}</code>. Proxy nur Weiterleitung.`)}
        ${renderCertMeta()}
        ${renderExpiryNotice()}
        ${portForwardWarning()}
        <p class="wizard-step-lead">Diese Adressen ersetzen die alten HTTP-Lesezeichen und Anmeldungen:</p>
        <ul class="device-urls-list">${deviceUrlItems(base)}</ul>
        <h3 class="network-config-subheading">Auf einem zweiten Gerät prüfen</h3>
        <label class="wizard-checkbox">
          <input type="checkbox" id="second-device" ${state.secondDeviceOk ? 'checked' : ''} />
          <span>Auf einem zweiten LAN-Gerät geöffnet: <code>${escapeHtml(base)}</code> lädt ohne Zertifikatswarnung.</span>
        </label>
        ${state.rebindHint ? renderRebindHint(host, fallback) : ''}
        <div class="actions-row">
          <button type="button" class="btn-secondary" id="verify-fail">HTTPS-Adresse auf einem Gerät nicht auflösbar</button>
        </div>`,
    )}${renderStaleIp()}`;
  }
  if (networkStartPhase() && !mailIsReady()) {
    const nextDisabled = wizardNextDisabled(WIZARD_STEP.https, state.tlsPhase, {
      nameOk: nameOk(),
      ipv4Reserved: state.ipv4Reserved,
      mailIsReady: mailIsReady(),
    });
    return httpsSection(
      'HTTPS vorbereiten',
      `${notice(
        'warn',
        'Einstieg unter Netzwerk, weil der Assistent „Später“ gewählt hat. Nicht den Assistenten erneut öffnen.',
      )}
        ${renderTls()}
        ${networkActions(
          `<button type="button" class="btn-link" id="network-tls-back">Zurück</button>
          <button type="button" id="network-tls-next" ${nextDisabled ? 'disabled' : ''}>Weiter</button>`,
        )}`,
    );
  }
  if (state.ipv4Reserved) {
    return httpsSection(
      'HTTPS',
      `<p class="hint hint--preview"><code>https://${escapeHtml(hostname())}</code></p>
        <p class="wizard-step-lead">${dnsWaitCopy()}</p>
        ${renderTlsFollowup(false)}
        ${renderMailReplay()}`,
    );
  }
  if (!httpsEligible(state.proxyEnabled)) {
    return httpsSection('HTTPS', notice('warn', noProxyHttpsWarning()));
  }
  return httpsSection(
    'HTTPS',
    `<p class="hint">Noch nicht vorbereitet. HTTPS hier vorbereiten — nicht in den Assistenten zurück.</p>
      <button type="button" id="start-tls-network">HTTPS vorbereiten</button>`,
  );
}

function renderLanBlock() {
  const host = networkBlock(
    'Host im Praxisnetz',
    `<p class="hint">${escapeHtml(lanIp())} · ${escapeHtml(selectedLan().iface)} · <code>MAC ${escapeHtml(selectedLan().mac)}</code></p>`,
  );
  if (state.tlsApplied) {
    return `${host}${renderReachability()}`;
  }
  const rest = `${host}${renderHttpSave()}${renderReachability()}`;
  if (tlsIncomplete()) {
    return `<details><summary>LAN und Proxy — läuft bereits</summary>${rest}</details>`;
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
      const disabled = id === 'wizard' && wizardLocked;
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
  const tls = tlsState();
  const proxyLabel = state.proxyEnabled
    ? active
      ? 'Läuft · HTTPS (Proxy nur Weiterleitung)'
      : 'Läuft · Proxy'
    : 'Aus';
  let card;
  if (active) {
    card = `${notice('ok', `Geräte nutzen <code>https://${escapeHtml(hostname())}</code>. Proxy nur Weiterleitung.`)}
        ${renderCertMeta()}
        ${renderExpiryNotice()}
        ${notice(
          'warn',
          'Alte HTTP-Adressen und Anmeldungen gelten nicht mehr. TV und Tablets mit den Adressen unten neu eintragen.',
        )}`;
  } else if (tls === 'error') {
    card = `<section class="setup-entry">
        <p class="setup-entry-eyebrow">HTTPS</p>
        <h1>HTTPS fehlgeschlagen</h1>
        <p class="setup-entry-copy">HTTP läuft weiter. Fortsetzen unter <strong>Netzwerk</strong>.</p>
        <button type="button" class="setup-entry-start" id="resume-tls">Fortsetzen</button>
      </section>`;
  } else if (tls === 'obtaining-certificate') {
    card = `<section class="setup-entry">
        <p class="setup-entry-eyebrow">HTTPS</p>
        <h1>Zertifikat wird geholt</h1>
        <p class="setup-entry-copy">HTTP bleibt erreichbar. Fortsetzen unter <strong>Netzwerk</strong>.</p>
        <button type="button" class="setup-entry-start" id="resume-tls">Fortsetzen</button>
      </section>`;
  } else if (tls === 'dns-verified') {
    const ready = state.certPhase === CERT_PHASE.ready;
    card = `<section class="setup-entry">
        <p class="setup-entry-eyebrow">HTTPS</p>
        <h1>${ready ? 'Zertifikat liegt vor' : 'DNS stimmt'}</h1>
        <p class="setup-entry-copy">${
          ready
            ? 'HTTP bleibt, bis Sie unter Netzwerk auf HTTPS umstellen.'
            : 'Als Nächstes unter Netzwerk das Zertifikat holen — noch nicht umstellen.'
        }</p>
        <button type="button" class="setup-entry-start" id="resume-tls">Fortsetzen</button>
      </section>`;
  } else if (pending) {
    card = `<section class="setup-entry">
        <p class="setup-entry-eyebrow">HTTPS</p>
        <h1>HTTPS wartet auf DNS</h1>
        <p class="setup-entry-copy">${dnsWaitCopy()} ${continueHttpsLaterCopy()} Fortsetzen unter <strong>Netzwerk</strong>.</p>
        <p class="setup-entry-note">Den Manager schließen ist in Ordnung. Nicht zurück in den Assistenten.</p>
        <button type="button" class="setup-entry-start" id="resume-tls">Fortsetzen</button>
      </section>`;
  } else if (httpsEligible(state.proxyEnabled)) {
    card = `<section class="setup-entry">
        <p class="setup-entry-eyebrow">HTTPS</p>
        <h1>Noch nicht vorbereitet</h1>
        <p class="setup-entry-copy">Einstieg unter <strong>Netzwerk</strong> — nicht zurück in den Assistenten.</p>
        <button type="button" class="setup-entry-start" id="resume-tls">Unter Netzwerk beginnen</button>
      </section>`;
  } else {
    card = `<section class="setup-entry">
        <p class="setup-entry-eyebrow">HTTPS</p>
        <h1>Noch nicht vorbereitet</h1>
        <p class="setup-entry-copy">${noProxyHttpsWarning()}</p>
        <button type="button" class="setup-entry-start" id="resume-tls">Fortsetzen</button>
      </section>`;
  }
  const urlHeading = active
    ? 'Diese Adressen ersetzen die alten HTTP-Lesezeichen'
    : 'Vorläufige Geräte-URLs (über die IP)';
  const httpsLine =
    tls === 'active'
      ? `aktiv · ${escapeHtml(hostname())} · bis ${escapeHtml(certNotAfterLabel(state.expiryKind))}`
      : tls === 'degraded'
        ? `Warnung · ${escapeHtml(hostname())} · bis ${escapeHtml(certNotAfterLabel(state.expiryKind))}`
        : tls === 'error'
          ? `Fehler · ${escapeHtml(hostname())}`
          : tls === 'obtaining-certificate'
            ? `Zertifikat wird geholt · ${escapeHtml(hostname())}`
            : tls === 'dns-verified'
              ? state.certPhase === CERT_PHASE.ready
                ? `Zertifikat bereit · ${escapeHtml(hostname())}`
                : `DNS ok · ${escapeHtml(hostname())}`
              : pending
                ? `wartet auf DNS · ${escapeHtml(hostname())}`
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

/**
 * Inspect extras only — no restore wizard.
 * BackupPanel.svelte, RestoreWizardDialog.svelte,
 * restoreInspectSummaryLines / restoreInspectBlockedMessage,
 * inspectPfbackup, settings-backup-restore writeEnv→startFullStack.
 */
function mockInspectTls() {
  const tlsClaimsHttps = tlsInBackup({
    canonicalBaseUrl: state.tlsApplied ? `https://${hostname()}` : httpBase(),
    proxyMode: state.tlsApplied
      ? isCustomCert(state.nameMode)
        ? 'tls-custom'
        : 'tls-managed'
      : 'http',
  });
  const tlsPrepared = tlsPreparedInBackup({
    tlsState: tlsState(),
    tlsClaimsHttps,
  });
  const tlsMetadataConsistent = tlsBackupMetadataConsistent({
    tlsState: tlsState(),
    tlsClaimsHttps,
  });
  const sidecarPresent = state.sidecarSaved;
  const sidecarMatches = tlsSidecarMatches({
    backupInstallId: SAMPLE.installId,
    backupHostname: hostname(),
    sidecarInstallId: SAMPLE.installId,
    sidecarHostname: hostname(),
  });
  return {
    tlsClaimsHttps,
    tlsPrepared,
    sidecarPresent,
    sidecarMatches,
    line: tlsInspectLine({
      tlsMetadataConsistent,
      tlsClaimsHttps,
      tlsPrepared,
      sidecarPresent,
      sidecarMatches,
    }),
    blocked: tlsRestoreBlockedCopy({
      tlsMetadataConsistent,
      tlsClaimsHttps,
      sidecarPresent,
      sidecarMatches,
    }),
    warning: tlsRestoreWarningCopy({
      tlsMetadataConsistent,
      tlsPrepared,
      sidecarPresent,
      sidecarMatches,
    }),
    restoreOk: tlsRestoreSupported({
      archiveValid: true,
      settingsValid: true,
      targetAppReachable: true,
      tlsMetadataConsistent,
      tlsClaimsHttps,
      sidecarPresent,
      sidecarMatches,
    }),
  };
}

function renderMaintenance() {
  const stamp = SAMPLE.backupStamp;
  const sidecarName = tlsSidecarFileName(stamp);
  const inspect = mockInspectTls();
  const tlsOn = state.ipv4Reserved || state.tlsApplied;
  const inspectHint = inspect.line
    ? `<p class="hint">Inspect-Zeile (wie Routing/Portal): <code>${escapeHtml(inspect.line)}</code>${
        inspect.restoreOk ? '' : ' — restoreSupported = false'
      }</p>`
    : '<p class="hint">Inspect-Zeile HTTPS nur, wenn Canonical schon <code>https://</code> oder <code>PROXY_MODE=tls-*</code> ist (nach dem Umstellen).</p>';
  const blocked = inspect.blocked ? notice('warn', escapeHtml(inspect.blocked)) : '';
  const restoreWarning = inspect.warning ? notice('warn', escapeHtml(inspect.warning)) : '';
  const tlsBlock = tlsOn
    ? networkBlock(
        'HTTPS-State (Pilot)',
        `<p class="hint">Caddy-Daten und ACME-Berechtigung liegen nicht in der <code>.pfbackup</code>. Extra sichern, sobald HTTPS vorbereitet ist — nicht erst nach dem Umstellen. Dateiname <code>${escapeHtml(
          sidecarName,
        )}</code> neben <code>praxis-flow-${escapeHtml(stamp)}.pfbackup</code>.</p>
        ${inspectHint}
        ${blocked}
        ${restoreWarning}
        <p class="hint">Electron-Main liest das Sidecar gleichen Zeitstempels und übergibt den Inhalt an Setup. Nur bei aktivem HTTPS folgt ohne Treffer der zweite Dateidialog — bestehender Restore-Wizard, kein zweiter Assistent.</p>
        <div class="actions-row">
          <button type="button" class="btn-secondary" id="tls-sidecar">HTTPS-State sichern</button>
        </div>
        ${
          state.sidecarSaved
            ? `<p class="hint">Im Mock nur der Dateiname. Echte Datei: Caddy /data + /config neben dem .pfbackup.</p>`
            : ''
        }`,
      )
    : networkBlock(
        'HTTPS-State (Pilot)',
        '<p class="hint">Sobald HTTPS vorbereitet ist, erscheint hier die Sidecar-Sicherung neben dem Praxis-Backup.</p>',
      );
  return `<header class="app-header"><h1>Wartung</h1></header>
    ${mockNav('maintenance')}
    ${networkBlock(
      'Praxis-Backup (.pfbackup)',
      `<p class="hint">Settings, Stack-<code>.env</code>, Manager-Stand. Kein Caddy-State, keine Patientendaten.</p>
      <div class="actions-row">
        <button type="button" class="btn-secondary" disabled>Backup erstellen</button>
        <button type="button" class="btn-secondary" disabled>Backup prüfen</button>
        <button type="button" class="btn-secondary" disabled>Wiederherstellen …</button>
      </div>`,
    )}
    ${tlsBlock}`;
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

function goMaintenance() {
  state.view = 'maintenance';
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
  const preview = document.getElementById('hostname-preview');
  if (preview) {
    preview.textContent = `https://${hostname()}`;
  }
  const input = document.getElementById('custom-label') || document.getElementById('custom-domain');
  const bad =
    input?.parentElement?.querySelector('.notice.is-bad') ??
    document.querySelector('#step-body .notice.is-bad');
  const invalid =
    (state.nameMode === NAME_MODE.label || state.nameMode === NAME_MODE.domain) && !nameOk();
  const message =
    state.nameMode === NAME_MODE.domain
      ? 'Voller Hostname mit Punkt, z. B. flow.praxis-meyer.de — nicht unter lan.notaus.de.'
      : 'DNS-Label: a–z, 0–9, Bindestrich, 1–63 Zeichen; nicht am Rand Bindestrich; keine Umlaute; nicht lan/acme/www/portal/mail.';
  if (invalid) {
    if (!bad && input) {
      input.insertAdjacentHTML('afterend', notice('bad', message));
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
  const mockView = event.target.closest('[data-mock-view]');
  if (mockView) {
    const id = mockView.dataset.mockView;
    if (id === 'status') {
      goStatus();
    } else if (id === 'network') {
      goNetwork();
    } else if (id === 'maintenance') {
      goMaintenance();
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
  if (button.id === 'tls-obtain') {
    if (state.diagnose !== 'ok' || state.tlsApplied) {
      return;
    }
    state.certPhase = CERT_PHASE.ready;
    state.checksOk = true;
    state.errorClass = null;
    render();
    return;
  }
  if (button.id === 'tls-cutover') {
    if (
      !canApplyTls({
        ipv4Reserved: state.ipv4Reserved,
        certReady: state.certPhase === CERT_PHASE.ready,
        checksOk: state.checksOk,
        tlsActive: state.tlsApplied,
      })
    ) {
      return;
    }
    state.tlsApplied = true;
    render();
    return;
  }
  if (button.id === 'tls-repair') {
    state.certPhase = CERT_PHASE.ready;
    state.checksOk = true;
    state.errorClass = null;
    render();
    return;
  }
  if (button.id === 'tls-reset') {
    state.ipv4Reserved = false;
    state.mailAck = false;
    state.mailSent = false;
    state.practiceDnsAck = false;
    state.pemAck = false;
    state.mailNotedAt = '';
    state.diagnose = null;
    state.certPhase = CERT_PHASE.none;
    state.errorClass = null;
    state.tlsApplied = false;
    state.tlsPhase = 'offer';
    state.sidecarSaved = false;
    render();
    return;
  }
  if (button.id === 'tls-renew') {
    state.expiryKind = EXPIRY_KIND.ok;
    state.certPhase = CERT_PHASE.ready;
    render();
    return;
  }
  if (button.id === 'stale-keep') {
    state.lanIpStale = false;
    render();
    return;
  }
  if (button.id === 'stale-take') {
    state.lanIpStale = false;
    render();
    return;
  }
  if (button.id === 'tls-sidecar') {
    state.sidecarSaved = true;
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
  if (target.id === 'pem-ack') {
    state.pemAck = target.checked;
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
  const maintenance = document.getElementById('maintenance-shell');
  wizard.hidden = state.view !== 'wizard';
  status.hidden = state.view !== 'status';
  network.hidden = state.view !== 'network';
  maintenance.hidden = state.view !== 'maintenance';
  if (state.view === 'status') {
    status.innerHTML = renderStatus();
    return;
  }
  if (state.view === 'network') {
    network.innerHTML = renderNetwork();
    return;
  }
  if (state.view === 'maintenance') {
    maintenance.innerHTML = renderMaintenance();
    return;
  }
  document.getElementById('step-title').textContent = WIZARD_STEP_TITLES[state.step];
  document.getElementById('step-body').innerHTML = renderBody();
  renderSteps();
  renderActions();
  syncNextDisabled();
}

try {
  render();
} catch (err) {
  const body = document.getElementById('step-body');
  if (body) {
    body.textContent =
      'Mock konnte nicht starten: ' + (err && err.message ? err.message : String(err));
  }
  console.error(err);
}
