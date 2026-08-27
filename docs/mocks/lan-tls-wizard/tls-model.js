/**
 * Portable LAN-TLS model for the Manager port.
 *
 * Architecture: docs/plan-proxy-tls.md
 * Manager UX:   docs/plan-proxy-tls-manager.md
 *
 * Lift this file first. It has no DOM. Suggested Manager landing spots:
 *   WIZARD_STEP / planWizardNext     → manager/src/renderer/wizard-flow.ts
 *   wizardNextLabel / wizardBackHidden → wizard-view-model.ts
 *   hostname / nameValid / mail bodies → new tls-identity.ts (or similar)
 *   deriveTlsState                   → GET /host/status `tls.state`
 *
 * Do not implement TLS in the Manager before the customer test.
 */

// ---------------------------------------------------------------------------
// Wizard numbering
// Current Manager is 1–7 (preview=6, apply=7). Insert HTTPS as 6 and shift.
// ---------------------------------------------------------------------------

export const WIZARD_STEP = {
  prerequisites: 1,
  routing: 2,
  folders: 3,
  network: 4,
  access: 5,
  https: 6,
  preview: 7,
  apply: 8,
};

export const WIZARD_STEP_LABELS = [
  'Voraussetzungen',
  'Routing',
  'Import & Export',
  'Netzwerk',
  'Zugang',
  'HTTPS',
  'Vorschau',
  'Abschluss',
];

export const WIZARD_STEP_TITLES = {
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
export const HTTPS_PHASES = ['offer', 'hostname', 'lease', 'mail'];

export const NAME_MODE = {
  generated: 'generated',
  label: 'label',
  domain: 'domain',
};

/** Plan sample host. Installation ID is random, stable, not a secret. */
export const SAMPLE = {
  installId: '7fk3m2q9',
  generatedLabel: '7fk3m2',
  token: 'n7k-p2q9-xw4m-8t3f',
  lan: [
    { address: '192.168.178.112', iface: 'Ethernet', mac: 'A4:83:E7:12:9C:40' },
    { address: '192.168.178.40', iface: 'WLAN', mac: '3C:22:FB:9A:04:18' },
  ],
};

/** Public operator zone. No `praxis-` prefix. Open: 6-char alphabet (no 0/O, 1/l/I). */
export const OPERATOR_ZONE = 'lan.notaus.de';

/** ACME CNAME target stays on the install ID, not the visible hostname. */
export const ACME_ZONE = 'acme.notaus.de';

/** mailto: recipient — product config, not hardcoded long-term (manager plan open #3). */
export const OPERATOR_MAIL = 'cert@notaus.de';

const RESERVED_LABELS = ['lan', 'acme', 'www', 'portal', 'mail'];

export function httpsEligible(proxyEnabled) {
  return Boolean(proxyEnabled);
}

export function isOwnDomain(nameMode) {
  return nameMode === NAME_MODE.domain;
}

export function hostnameOf({ nameMode, customLabel, customDomain }) {
  if (nameMode === NAME_MODE.generated) {
    return `${SAMPLE.generatedLabel}.${OPERATOR_ZONE}`;
  }
  if (nameMode === NAME_MODE.label) {
    const label = customLabel.trim().toLowerCase();
    return `${label || '…'}.${OPERATOR_ZONE}`;
  }
  return normalizeOwnDomain(customDomain) || 'flow.praxis.example';
}

export function normalizeOwnDomain(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
}

export function nameValid({ nameMode, customLabel, customDomain }) {
  if (nameMode === NAME_MODE.generated) {
    return true;
  }
  if (nameMode === NAME_MODE.label) {
    const label = customLabel.trim().toLowerCase();
    if (!/^[a-z0-9]([a-z0-9-]{1,18}[a-z0-9])?$/.test(label)) {
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
 * Operator zone → lan.notaus.de; own domain → registrable apex.
 */
export function rebindFallback(nameMode, hostname) {
  if (!isOwnDomain(nameMode)) {
    return OPERATOR_ZONE;
  }
  const parts = hostname.split('.');
  return parts.length >= 2 ? parts.slice(-2).join('.') : hostname;
}

export function httpOrigin(proxyEnabled, lanIp) {
  return proxyEnabled ? `http://${lanIp}` : `http://${lanIp}:8080`;
}

/** After cutover, CANONICAL_BASE_URL is always https://<hostname> with no :443. */
export function canonicalOrigin({ tlsActive, hostname, proxyEnabled, lanIp }) {
  if (tlsActive) {
    return `https://${hostname}`;
  }
  return httpOrigin(proxyEnabled, lanIp);
}

export function devicePaths() {
  return [
    ['Terminal', '/terminal'],
    ['TV', '/tv'],
    ['MFA', '/mfa'],
    ['Portal', '/portal'],
    ['Ops', '/ops/setup'],
  ];
}

export function acmeCnameTarget(installId = SAMPLE.installId) {
  return `${installId}.${ACME_ZONE}.`;
}

export function operatorMailSubject(hostname) {
  return `Praxis Flow TLS-DNS — ${hostname}`;
}

/** Operator-zone mail (plan-proxy-tls.md). A + ACME CNAME. Token is one-shot. */
export function operatorZoneMailBody({ hostname, lanIp, installId = SAMPLE.installId, token = SAMPLE.token }) {
  return [
    `Installations-ID:  ${installId}`,
    `Einmal-Token:      ${token}`,
    `Hostname:          ${hostname}`,
    `LAN-IP:            ${lanIp}`,
    '',
    'Bitte anlegen:',
    '',
    `${hostname}.                   A      ${lanIp}`,
    `_acme-challenge.${hostname}.   CNAME  ${acmeCnameTarget(installId)}`,
  ].join('\n');
}

/** Records the practice creates at their registrar. */
export function practiceDnsRecordsBody({ hostname, lanIp, installId = SAMPLE.installId }) {
  return [
    `${hostname}.                         A      ${lanIp}`,
    `_acme-challenge.${hostname}.         CNAME  ${acmeCnameTarget(installId)}`,
  ].join('\n');
}

/**
 * Own-domain operator mail (plan-proxy-tls.md): ACME unlock only, no A-record
 * in lan.notaus.de. Mock UI currently uses records-only for this path; wire
 * this as the second block in the Manager.
 */
export function operatorUnlockMailBody({ hostname, lanIp, installId = SAMPLE.installId, token = SAMPLE.token }) {
  return [
    `Installations-ID:  ${installId}`,
    `Einmal-Token:      ${token}`,
    `Hostname:          ${hostname}`,
    `LAN-IP:            ${lanIp}`,
    '',
    `Bitte ${installId}.${ACME_ZONE} für die ACME-Delegation freischalten.`,
    'Kein A-Record in lan.notaus.de — A und CNAME setzt die Praxis selbst:',
    '',
    `${hostname}.                         A      ${lanIp}`,
    `_acme-challenge.${hostname}.         CNAME  ${acmeCnameTarget(installId)}`,
  ].join('\n');
}

export function mailtoHref(to, subject, body) {
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Wizard can continue after this. Own-domain mock: practiceDnsAck only.
 * Manager plan still wants the short unlock mail as a second block.
 */
export function mailReady({ nameMode, mailAck, practiceDnsAck }) {
  if (isOwnDomain(nameMode)) {
    return Boolean(practiceDnsAck);
  }
  return Boolean(mailAck);
}

/**
 * Maps mock flags to GET /host/status tls.state.
 * awaiting-operator-dns is the normal state and may last days — no timeout.
 * PROXY_MODE stays http until cutover; do not infer TLS from proxy.
 */
export function deriveTlsState({ offerLater, ipv4Reserved, mailPrepared, dnsVerified, tlsActive }) {
  if (tlsActive) {
    return 'active';
  }
  if (dnsVerified) {
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

export function httpsPhaseIndex(phase) {
  const index = HTTPS_PHASES.indexOf(phase);
  return index < 0 ? 0 : index;
}

export function nextHttpsPhase(phase) {
  const index = httpsPhaseIndex(phase);
  return HTTPS_PHASES[index + 1] ?? null;
}

export function previousHttpsPhase(phase) {
  const index = httpsPhaseIndex(phase);
  if (index <= 0) {
    return null;
  }
  return HTTPS_PHASES[index - 1] ?? null;
}

export function wizardBackHidden(step) {
  return step <= WIZARD_STEP.prerequisites || step === WIZARD_STEP.apply;
}

export function wizardNextLabel(step, { proxyEnabled, httpsPhase }) {
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

export function wizardNextDisabled(step, httpsPhase, { nameOk, ipv4Reserved, mailIsReady }) {
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
export function planWizardNext(step, httpsPhase, ctx) {
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

export function planWizardBack(step, httpsPhase, { ipv4Reserved, proxyEnabled }) {
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

export function planNetworkTlsNext(httpsPhase, { nameOk, ipv4Reserved, mailIsReady }) {
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

export function planNetworkTlsBack(httpsPhase) {
  if (httpsPhase === 'mail') {
    return 'lease';
  }
  if (httpsPhase === 'lease') {
    return 'hostname';
  }
  return 'offer';
}

/** Server-side verify-dns rows. Second-device / rebind are practice-confirmed, not here. */
export function diagnoseItems({ ipv4Reserved, dnsVerified }) {
  const waiting = dnsVerified ? 'is-done' : 'is-open';
  const waitLabel = dnsVerified ? '' : ' — bis zu 48 Stunden';
  return [
    { status: 'is-done', text: 'Server hat eine IPv4-Adresse' },
    {
      status: ipv4Reserved ? 'is-done' : 'is-open',
      text: 'feste IP / DHCP-Reservierung bestätigt',
    },
    {
      status: waiting,
      text: `Öffentlicher A-Record zeigt auf diese IP${waitLabel}`,
    },
    {
      status: waiting,
      text: `ACME-CNAME gesetzt${waitLabel}`,
    },
  ];
}
