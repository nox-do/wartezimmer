/**
 * Portable LAN-TLS model for the Manager port.
 *
 * Architecture: docs/plan-proxy-tls.md
 * Manager UX:   docs/plan-proxy-tls-manager.md
 *
 * Lift the portable bindings from this file selectively. It has no DOM.
 * Classic script (no `export`) so the mock opens as a file;
 * `globalThis.LanTlsModel` is the public Mock surface.
 *
 * Suggested Manager landing spots:
 *   WIZARD_STEP / planWizardNext     → manager/src/renderer/wizard-flow.ts
 *   wizardNextLabel / wizardBackHidden → wizard-view-model.ts
 *   hostname / nameValid / mail bodies → new tls-identity.ts (or similar)
 *   deriveTlsState                   → Mock-only; Manager reads GET /host/status
 *   canObtainCertificate / canApplyTls → Mock UI only; port maps buttons to
 *                                    tls.state / tls.applyReady from status
 *   tlsInBackup / tlsInspectLine / tlsRestoreSupported
 *                                    → inspectPfbackup + restoreInspectSummaryLines
 *   active-TLS Network save guard    → network-controller.ts + Setup host-state/proxy
 *
 * Do not implement TLS in the Manager before the customer test.
 */

(function (global) {
  // ---------------------------------------------------------------------------
  // Wizard numbering
  // Manager wizard is 1–8 after HTTPS insert (preview=7, apply=8). Steps 1–3 stay in
  // WizardSteps.svelte / wizard-flow.ts — this mock only renders from network onward.
  // ---------------------------------------------------------------------------

  const WIZARD_MOCK_FIRST = 4;

  const WIZARD_STEP = {
    prerequisites: 1,
    routing: 2,
    folders: 3,
    network: WIZARD_MOCK_FIRST,
    access: 5,
    https: 6,
    preview: 7,
    apply: 8,
  };

  const WIZARD_STEP_LABELS = [
    'Voraussetzungen',
    'Routing',
    'Import & Export',
    'Netzwerk',
    'Zugang',
    'HTTPS',
    'Vorschau',
    'Abschluss',
  ];

  const WIZARD_STEP_TITLES = {
    [WIZARD_STEP.prerequisites]: 'Voraussetzungen',
    [WIZARD_STEP.routing]: 'Routing',
    [WIZARD_STEP.folders]: 'Import & Export — Host-Ordner',
    [WIZARD_STEP.network]: 'Netzwerk — Host',
    [WIZARD_STEP.access]: 'Zugang — Proxy',
    [WIZARD_STEP.https]: 'HTTPS',
    [WIZARD_STEP.preview]: 'Vorschau — Geräte-URLs',
    [WIZARD_STEP.apply]: 'Abschluss',
  };

  /**
   * Inner screens of wizard step 6. The step badge stays 6; dots show progress.
   * After the mail/records screen, leave the wizard HTTPS track — preview/apply
   * stay HTTP. verify-dns and cutover live on the Network tab.
   */
  const HTTPS_PHASES = ['offer', 'hostname', 'lease', 'mail'];

  const NAME_MODE = {
    generated: 'generated',
    label: 'label',
    domain: 'domain',
  };

  /** Follows name mode: operator zone → Let's Encrypt; own domain → PEM. */
  const CERT_SOURCE = {
    managed: 'managed',
    custom: 'custom',
  };

  /** DNS label (RFC 1123 LDH): 1–63, a-z 0-9 hyphen, no leading/trailing hyphen. */
  const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

  /** Generated 6-char default: DNS-safe, no 0/O 1/l/I. */
  const GENERATED_LABEL_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

  /** Plan sample host. Installation ID is random, stable, not a secret. */
  const SAMPLE = {
    installId: '7fk3m2q9',
    generatedLabel: '7fk3m2',
    token: 'n7k-p2q9-xw4m-8t3f',
    acmeDnsFulldomain: 'a097455b-52cc-4569-90c8-7a4b97c6eba8.auth.acme-dns.io',
    certIssuer: "Let's Encrypt",
    certIssuerCustom: 'Eigenes Zertifikat',
    certNotAfterOk: '20.11.2026',
    certNotAfterSoon: '10.09.2026',
    certNotAfterExpired: '20.08.2026',
    backupStamp: '20260827-2215',
    lan: [
      { address: '192.168.178.112', iface: 'Ethernet', mac: 'A4:83:E7:12:9C:40' },
      { address: '192.168.178.40', iface: 'WLAN', mac: '3C:22:FB:9A:04:18' },
    ],
  };

  /** UI error classes from plan-proxy-tls.md. Rebind is practice-reported, not here. */
  const TLS_ERROR_CLASS = {
    aRecord: 'a-record',
    collision: 'collision',
    dnsFilter: 'dns-filter',
    isolation: 'isolation',
    firewall: 'firewall',
    port443: 'port-443',
    clock: 'clock',
    acme: 'acme',
    certName: 'cert-name',
  };

  const CERT_PHASE = {
    none: 'none',
    obtaining: 'obtaining',
    ready: 'ready',
    error: 'error',
  };

  const EXPIRY_KIND = {
    ok: 'ok',
    soon: 'soon',
    expired: 'expired',
  };

  /** Manager start + TLS surface: warn when notAfter is within this many days. */
  const EXPIRY_SOON_DAYS = 21;

  /** Test operator zone (`notaus.de` is fallback/test, not the product domain). */
  const OPERATOR_ZONE = 'lan.notaus.de';

  /** Product zone later — see plan-proxy-tls.md. Not used in this PoC mock. */
  const PRODUCT_OPERATOR_ZONE = 'lan.praxis-flow.de';

  /** PoC ACME-DNS API. Product later: https://auth.acme.praxis-flow.de */
  const ACME_DNS_POC = 'https://auth.acme-dns.io';

  /** CNAME parent for PoC register fulldomain. */
  const ACME_ZONE = 'auth.acme-dns.io';

  /** mailto: recipient for operator-zone mail. Product address, not a config screen. */
  const OPERATOR_MAIL = 'cert@notaus.de';

  const RESERVED_LABELS = ['lan', 'acme', 'www', 'portal', 'mail'];

  function httpsEligible(proxyEnabled) {
    return Boolean(proxyEnabled);
  }

  function isOwnDomain(nameMode) {
    return nameMode === NAME_MODE.domain;
  }

  function hostnameOf({ nameMode, customLabel, customDomain }) {
    if (nameMode === NAME_MODE.generated) {
      return `${SAMPLE.generatedLabel}.${OPERATOR_ZONE}`;
    }
    if (nameMode === NAME_MODE.label) {
      const label = customLabel.trim().toLowerCase();
      return `${label || '…'}.${OPERATOR_ZONE}`;
    }
    return normalizeOwnDomain(customDomain) || 'flow.praxis.example';
  }

  function normalizeOwnDomain(value) {
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/\.$/, '');
  }

  function nameValid({ nameMode, customLabel, customDomain }) {
    if (nameMode === NAME_MODE.generated) {
      return true;
    }
    if (nameMode === NAME_MODE.label) {
      const label = customLabel.trim().toLowerCase();
      if (!DNS_LABEL.test(label)) {
        return false;
      }
      return !RESERVED_LABELS.includes(label);
    }
    const host = normalizeOwnDomain(customDomain);
    if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(host)) {
      return false;
    }
    return host.includes('.') && !host.endsWith(`.${OPERATOR_ZONE}`);
  }

  /**
   * Smallest rebind exception if the router cannot pin the exact host.
   * Operator zone is known. An own-domain apex must come from a Public-Suffix-aware
   * Manager helper; the static mock conservatively keeps the exact host.
   */
  function rebindFallback(nameMode, hostname, registrableDomain = '') {
    if (!isOwnDomain(nameMode)) {
      return OPERATOR_ZONE;
    }
    return normalizeOwnDomain(registrableDomain) || normalizeOwnDomain(hostname);
  }

  function httpOrigin(proxyEnabled, lanIp) {
    return proxyEnabled ? `http://${lanIp}` : `http://${lanIp}:8080`;
  }

  /** After cutover, CANONICAL_BASE_URL is always https://<hostname> with no :443. */
  function canonicalOrigin({ tlsActive, hostname, proxyEnabled, lanIp }) {
    if (tlsActive) {
      return `https://${hostname}`;
    }
    return httpOrigin(proxyEnabled, lanIp);
  }

  function devicePaths() {
    return [
      ['Terminal', '/terminal'],
      ['TV', '/tv'],
      ['MFA', '/mfa'],
      ['Portal', '/portal'],
      ['Ops', '/ops/setup'],
    ];
  }

  /** PoC: fulldomain from auth.acme-dns.io /register. Product later: `{id}.auth.acme.praxis-flow.de`. */
  function acmeCnameTarget() {
    return `${SAMPLE.acmeDnsFulldomain}.`;
  }

  function operatorMailSubject(hostname) {
    return `Praxis Flow TLS-DNS — ${hostname}`;
  }

  /** Operator-zone mail (plan-proxy-tls.md). A + ACME CNAME. Token is one-shot. */
  function operatorZoneMailBody({
    hostname,
    lanIp,
    installId = SAMPLE.installId,
    token = SAMPLE.token,
    tokenConsumed = false,
  }) {
    const tokenLine = tokenConsumed
      ? 'Einmal-Token:      (bereits verwendet, nicht erneut anzeigen)'
      : `Einmal-Token:      ${token}`;
    return [
      `Installations-ID:  ${installId}`,
      tokenLine,
      `Hostname:          ${hostname}`,
      `LAN-IP:            ${lanIp}`,
      '',
      'Bitte anlegen:',
      '',
      `${hostname}.                   A      ${lanIp}`,
      `_acme-challenge.${hostname}.   CNAME  ${acmeCnameTarget(installId)}`,
    ].join('\n');
  }

  function practiceARecordBody({ hostname, lanIp }) {
    return `${hostname}.                         A      ${lanIp}`;
  }

  function mailtoHref(to, subject, body) {
    return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  function certSourceOf(nameMode) {
    return isOwnDomain(nameMode) ? CERT_SOURCE.custom : CERT_SOURCE.managed;
  }

  function isCustomCert(nameMode) {
    return certSourceOf(nameMode) === CERT_SOURCE.custom;
  }

  /**
   * Wizard can continue after the fourth HTTPS phase.
   * Operator zone (notaus): mail ack (Let's Encrypt).
   * Own domain: PEM ack (tls-custom). Name mode is the fork — no extra cert radio.
   */
  function mailReady({ nameMode, mailAck, pemAck }) {
    if (isCustomCert(nameMode)) {
      return Boolean(pemAck);
    }
    return Boolean(mailAck);
  }

  /**
   * Mock-only projection for static jump states. Do not port this as a second
   * renderer-side state machine; the Manager reads authoritative GET /host/status.
   * awaiting-operator-dns is the normal state and may last days — no timeout.
   * PROXY_MODE stays http until cutover; do not infer TLS from proxy.
   * After obtain succeeds, state stays dns-verified until apply (no extra enum).
   */
  function deriveTlsState({
    offerLater,
    ipv4Reserved,
    mailPrepared,
    dnsVerified,
    obtainingCert,
    certReady,
    tlsActive,
    degraded,
    hasError,
  }) {
    if (tlsActive && hasError) {
      return 'error';
    }
    if (tlsActive && degraded) {
      return 'degraded';
    }
    if (tlsActive) {
      return 'active';
    }
    if (hasError) {
      return 'error';
    }
    if (obtainingCert) {
      return 'obtaining-certificate';
    }
    if (dnsVerified || certReady) {
      return 'dns-verified';
    }
    if (mailPrepared) {
      return 'awaiting-operator-dns';
    }
    if (ipv4Reserved) {
      return 'preparing';
    }
    if (offerLater) {
      return 'off';
    }
    return 'off';
  }

  function tokenConsumed({ certReady, tlsActive }) {
    return Boolean(certReady || tlsActive);
  }

  function canObtainCertificate({ dnsVerified, obtainingCert, certReady, tlsActive }) {
    return Boolean(dnsVerified && !obtainingCert && !certReady && !tlsActive);
  }

  function canApplyTls({ ipv4Reserved, certReady, checksOk, tlsActive }) {
    return Boolean(ipv4Reserved && certReady && checksOk && !tlsActive);
  }

  function httpsPhaseIndex(phase) {
    const index = HTTPS_PHASES.indexOf(phase);
    return index < 0 ? 0 : index;
  }

  function nextHttpsPhase(phase) {
    const index = httpsPhaseIndex(phase);
    return HTTPS_PHASES[index + 1] ?? null;
  }

  function previousHttpsPhase(phase) {
    const index = httpsPhaseIndex(phase);
    if (index <= 0) {
      return null;
    }
    return HTTPS_PHASES[index - 1] ?? null;
  }

  function wizardBackHidden(step) {
    return step <= WIZARD_STEP.network || step === WIZARD_STEP.apply;
  }

  function wizardNextLabel(step, { proxyEnabled, httpsPhase }) {
    if (step === WIZARD_STEP.access) {
      return httpsEligible(proxyEnabled) ? 'Weiter zu HTTPS' : 'Vorschau laden';
    }
    if (step === WIZARD_STEP.https) {
      return httpsPhase === 'mail' ? 'Vorschau laden' : 'Weiter';
    }
    if (step === WIZARD_STEP.preview) {
      return 'Anwenden';
    }
    if (step === WIZARD_STEP.apply) {
      return 'Zum Status';
    }
    return 'Weiter';
  }

  function wizardNextDisabled(step, httpsPhase, { nameOk, ipv4Reserved, mailIsReady }) {
    if (step !== WIZARD_STEP.https) {
      return false;
    }
    if (httpsPhase === 'hostname') {
      return !nameOk;
    }
    if (httpsPhase === 'lease') {
      return !ipv4Reserved;
    }
    if (httpsPhase === 'mail') {
      return !mailIsReady;
    }
    return false;
  }

  /**
   * Advance from the current wizard step / HTTPS phase.
   * @returns {{ type: 'goto', step: number } | { type: 'https-phase', phase: string } | { type: 'complete' } | { type: 'blocked' }}
   */
  function planWizardNext(step, httpsPhase, ctx) {
    const { proxyEnabled, offerLater, nameOk, ipv4Reserved, mailIsReady } = ctx;

    if (step === WIZARD_STEP.access && !httpsEligible(proxyEnabled)) {
      return { type: 'goto', step: WIZARD_STEP.preview };
    }
    if (step < WIZARD_STEP.https) {
      return { type: 'goto', step: step + 1 };
    }
    if (step === WIZARD_STEP.https) {
      if (httpsPhase === 'offer') {
        if (offerLater) {
          return { type: 'goto', step: WIZARD_STEP.preview };
        }
        return { type: 'https-phase', phase: 'hostname' };
      }
      if (httpsPhase === 'hostname') {
        return nameOk ? { type: 'https-phase', phase: 'lease' } : { type: 'blocked' };
      }
      if (httpsPhase === 'lease') {
        return ipv4Reserved ? { type: 'https-phase', phase: 'mail' } : { type: 'blocked' };
      }
      if (httpsPhase === 'mail') {
        return mailIsReady ? { type: 'goto', step: WIZARD_STEP.preview } : { type: 'blocked' };
      }
      return { type: 'goto', step: WIZARD_STEP.preview };
    }
    if (step === WIZARD_STEP.preview) {
      return { type: 'goto', step: WIZARD_STEP.apply };
    }
    if (step === WIZARD_STEP.apply) {
      return { type: 'complete' };
    }
    return { type: 'blocked' };
  }

  function planWizardBack(step, httpsPhase, { ipv4Reserved, proxyEnabled }) {
    if (step === WIZARD_STEP.preview && ipv4Reserved) {
      return { type: 'https-phase', phase: 'mail' };
    }
    if (step === WIZARD_STEP.preview && !httpsEligible(proxyEnabled)) {
      return { type: 'goto', step: WIZARD_STEP.access };
    }
    if (step !== WIZARD_STEP.https) {
      return { type: 'goto', step: step - 1 };
    }
    const previous = previousHttpsPhase(httpsPhase);
    if (!previous) {
      return { type: 'goto', step: WIZARD_STEP.access };
    }
    return { type: 'https-phase', phase: previous };
  }

  function planNetworkTlsNext(httpsPhase, { nameOk, ipv4Reserved, mailIsReady }) {
    if (httpsPhase === 'hostname') {
      return nameOk ? { type: 'https-phase', phase: 'lease' } : { type: 'blocked' };
    }
    if (httpsPhase === 'lease') {
      return ipv4Reserved ? { type: 'https-phase', phase: 'mail' } : { type: 'blocked' };
    }
    if (httpsPhase === 'mail') {
      return mailIsReady ? { type: 'stay' } : { type: 'blocked' };
    }
    return { type: 'blocked' };
  }

  function planNetworkTlsBack(httpsPhase) {
    if (httpsPhase === 'mail') {
      return 'lease';
    }
    if (httpsPhase === 'lease') {
      return 'hostname';
    }
    return 'offer';
  }

  /** Server-side verify-dns rows. Second-device / rebind are practice-confirmed, not here. */
  function diagnoseItems({ ipv4Reserved, dnsVerified, nameMode }) {
    const waiting = dnsVerified ? 'is-done' : 'is-open';
    const items = [
      { status: 'is-done', text: 'Server hat eine IPv4-Adresse' },
      {
        status: ipv4Reserved ? 'is-done' : 'is-open',
        text: 'feste IP / DHCP-Reservierung bestätigt',
      },
      {
        status: waiting,
        text: 'Öffentlicher A-Record zeigt auf diese IP',
      },
    ];
    if (!isCustomCert(nameMode)) {
      items.push({
        status: waiting,
        text: 'ACME-CNAME gesetzt',
      });
    }
    return items;
  }

  /** Local checks after managed obtain or custom staged-cert check. Gate for apply. */
  function localCertChecks({ certReady, checksOk, obtainingCert }) {
    if (obtainingCert) {
      return [
        { status: 'is-open', text: 'TCP 443 lokal — Zertifikat wird geholt' },
        { status: 'is-open', text: 'Zertifikatskette und Name' },
        { status: 'is-open', text: 'HTTP/2' },
        { status: 'is-open', text: 'SSE-Tick' },
      ];
    }
    const status = checksOk ? 'is-done' : certReady ? 'is-bad' : 'is-open';
    return [
      { status, text: 'TCP 443 lokal' },
      { status, text: 'Zertifikatskette und Name' },
      { status, text: 'HTTP/2' },
      { status, text: 'SSE-Tick' },
    ];
  }

  function tlsErrorCopy(errorClass) {
    const rows = {
      [TLS_ERROR_CLASS.aRecord]: {
        title: 'A-Record fehlt.',
        action: 'Warten, bis ein eigener A-Record auf die LAN-IP zeigt.',
      },
      [TLS_ERROR_CLASS.collision]: {
        title: 'A-Record zeigt auf eine andere IP.',
        action: 'Ein eigener A-Record zeigt auf eine andere Adresse. Label prüfen oder Mail erneut.',
      },
      [TLS_ERROR_CLASS.dnsFilter]: {
        title: 'Öffentlicher DNS filtert die private Zieladresse.',
        action: 'Kein eigener Resolver. Praxis-IT: Filter für diesen Host prüfen.',
      },
      [TLS_ERROR_CLASS.isolation]: {
        title: 'Gerät erreicht den Praxisserver nicht (typisch Gast-WLAN).',
        action: 'Firewall im LAN: TCP 443 zum Praxisserver. Nicht in diesem Assistenten.',
      },
      [TLS_ERROR_CLASS.firewall]: {
        title: 'Port 443 ist lokal nicht erreichbar.',
        action: 'Windows-Firewall für Caddy / Praxis Flow prüfen.',
      },
      [TLS_ERROR_CLASS.port443]: {
        title: 'Port 443 ist belegt.',
        action: 'Den anderen Dienst beenden, dann erneut versuchen.',
      },
      [TLS_ERROR_CLASS.clock]: {
        title: 'Die Uhrzeit dieses Rechners wird von der Zertifizierungsstelle abgelehnt.',
        action: 'Windows-Zeit synchronisieren, dann erneut versuchen.',
      },
      [TLS_ERROR_CLASS.acme]: {
        title: 'Zertifikat konnte nicht ausgestellt werden (ACME).',
        action: 'Erneut versuchen. Das Einmal-Token nicht neu anzeigen.',
      },
      [TLS_ERROR_CLASS.certName]: {
        title: 'Das Zertifikat gilt nicht für den gewählten Hostnamen.',
        action: 'Erneut versuchen oder HTTPS-Vorbereitung verwerfen.',
      },
    };
    return (
      rows[errorClass] ?? {
        title: 'HTTPS ist fehlgeschlagen.',
        action: 'Erneut versuchen.',
      }
    );
  }

  function certNotAfterLabel(expiryKind) {
    if (expiryKind === EXPIRY_KIND.soon) {
      return SAMPLE.certNotAfterSoon;
    }
    if (expiryKind === EXPIRY_KIND.expired) {
      return SAMPLE.certNotAfterExpired;
    }
    return SAMPLE.certNotAfterOk;
  }

  /** Sidecar next to `.pfbackup`, same timestamp. Pilot; later inside the archive. */
  function tlsSidecarFileName(timestamp) {
    return `praxis-flow-tls-${timestamp}.tgz`;
  }

  /**
   * Inspect: backup claims HTTPS. Gate is .env after apply, not tls.state.
   * prepare-only backups stay HTTP in Canonical — sidecar still saved, no Inspect-block.
   */
  function tlsInBackup({ canonicalBaseUrl, proxyMode }) {
    const canonical = String(canonicalBaseUrl ?? '');
    const mode = String(proxyMode ?? '');
    return canonical.startsWith('https://') || mode === 'tls-managed' || mode === 'tls-custom';
  }

  const TLS_PREPARED_BACKUP_STATES = new Set([
    'preparing',
    'awaiting-operator-dns',
    'dns-verified',
    'obtaining-certificate',
    'error',
  ]);

  /** Non-secret TLS_STATE marker: preparation exists, but Canonical is still HTTP. */
  function tlsPreparedInBackup({ tlsState, tlsClaimsHttps }) {
    const state = String(tlsState ?? 'off');
    return !tlsClaimsHttps && TLS_PREPARED_BACKUP_STATES.has(state);
  }

  /** Reject contradictory state/env combinations instead of silently downgrading. */
  function tlsBackupMetadataConsistent({ tlsState, tlsClaimsHttps }) {
    const state = String(tlsState ?? 'off');
    if (state === 'active' || state === 'degraded') {
      return Boolean(tlsClaimsHttps);
    }
    if (state === 'off' || TLS_PREPARED_BACKUP_STATES.has(state)) {
      return !tlsClaimsHttps || state === 'error';
    }
    return false;
  }

  function tlsSidecarMatches({
    backupInstallId,
    backupHostname,
    sidecarInstallId,
    sidecarHostname,
  }) {
    const backupId = String(backupInstallId ?? '').trim();
    const sidecarId = String(sidecarInstallId ?? '').trim();
    const backupHost = normalizeOwnDomain(backupHostname);
    const sidecarHost = normalizeOwnDomain(sidecarHostname);
    return (
      Boolean(backupId) &&
      Boolean(sidecarId) &&
      Boolean(backupHost) &&
      Boolean(sidecarHost) &&
      backupId === sidecarId &&
      backupHost === sidecarHost
    );
  }

  /** TLS adds to, and never replaces, today's three Restore compatibility gates. */
  function tlsRestoreSupported({
    archiveValid,
    settingsValid,
    targetAppReachable,
    tlsMetadataConsistent,
    tlsClaimsHttps,
    sidecarPresent,
    sidecarMatches,
  }) {
    if (!archiveValid || !settingsValid || !targetAppReachable || !tlsMetadataConsistent) {
      return false;
    }
    if (!tlsClaimsHttps) {
      return true;
    }
    return Boolean(sidecarPresent && sidecarMatches);
  }

  /** Extra preview line in RestoreWizardDialog — same pattern as Routing/Portal. */
  function tlsInspectLine({
    tlsMetadataConsistent,
    tlsClaimsHttps,
    tlsPrepared,
    sidecarPresent,
    sidecarMatches,
  }) {
    if (!tlsMetadataConsistent) {
      return 'HTTPS: Angaben in der Sicherung passen nicht zusammen';
    }
    if (tlsPrepared) {
      if (!sidecarPresent) {
        return 'HTTPS war vorbereitet, Zertifikatsdatei fehlt — Vorbereitung wird verworfen';
      }
      if (!sidecarMatches) {
        return 'Zertifikatsdatei passt nicht zu diesem Backup — Vorbereitung wird verworfen';
      }
      return 'HTTPS ist vorbereitet; Zertifikatsdatei ist dabei';
    }
    if (!tlsClaimsHttps) {
      return null;
    }
    if (!sidecarPresent) {
      return 'HTTPS ist vorgesehen, aber die Zertifikatsdatei fehlt';
    }
    if (!sidecarMatches) {
      return 'Zertifikatsdatei gehört nicht zu diesem Computer oder Hostnamen';
    }
    return 'Zertifikat und HTTPS-Daten sind in der Sicherung enthalten';
  }

  /** Prepare-only restore stays HTTP and may discard an unavailable staged journey. */
  function tlsRestoreWarningCopy({
    tlsMetadataConsistent,
    tlsPrepared,
    sidecarPresent,
    sidecarMatches,
  }) {
    if (!tlsMetadataConsistent || !tlsPrepared || (sidecarPresent && sidecarMatches)) {
      return null;
    }
    return 'Diese Sicherung enthält nur eine vorbereitete HTTPS-Einrichtung, noch kein aktives Zertifikat. Wiederherstellen bleibt möglich; ohne die dazugehörige Zertifikatsdatei wird die Vorbereitung verworfen.';
  }

  /** restoreInspectBlockedMessage when restoreSupported is false because of TLS. */
  function tlsRestoreBlockedCopy({
    tlsMetadataConsistent,
    tlsClaimsHttps,
    sidecarPresent,
    sidecarMatches,
  }) {
    if (!tlsMetadataConsistent) {
      return 'Die HTTPS-Angaben in dieser Sicherung passen nicht zusammen. Wiederherstellen wird abgelehnt.';
    }
    if (!tlsClaimsHttps) {
      return null;
    }
    if (!sidecarPresent) {
      return 'Diese Sicherung erwartet HTTPS, aber die Zertifikatsdatei fehlt. Wiederherstellen würde Geräte auf https:// stellen ohne Zertifikat — deshalb abgelehnt.';
    }
    if (!sidecarMatches) {
      return 'Die Zertifikatsdatei gehört zu einer anderen Installation oder einem anderen Hostnamen.';
    }
    return null;
  }

  global.LanTlsModel = {
    ACME_DNS_POC,
    ACME_ZONE,
    CERT_PHASE,
    CERT_SOURCE,
    DNS_LABEL,
    EXPIRY_KIND,
    EXPIRY_SOON_DAYS,
    GENERATED_LABEL_ALPHABET,
    HTTPS_PHASES,
    NAME_MODE,
    OPERATOR_MAIL,
    OPERATOR_ZONE,
    PRODUCT_OPERATOR_ZONE,
    SAMPLE,
    TLS_ERROR_CLASS,
    WIZARD_MOCK_FIRST,
    WIZARD_STEP,
    WIZARD_STEP_LABELS,
    WIZARD_STEP_TITLES,
    acmeCnameTarget,
    canApplyTls,
    canObtainCertificate,
    canonicalOrigin,
    certNotAfterLabel,
    certSourceOf,
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
    nextHttpsPhase,
    normalizeOwnDomain,
    operatorMailSubject,
    operatorZoneMailBody,
    planNetworkTlsBack,
    planNetworkTlsNext,
    planWizardBack,
    planWizardNext,
    practiceARecordBody,
    previousHttpsPhase,
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
  };
})(globalThis);
