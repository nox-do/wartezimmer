import type {
  TlsCertificateStatus,
  TlsDnsCheck,
  TlsErrorClass,
  TlsLocalCheck,
  TlsStatus,
} from '../shared/host-status.js';

export const TLS_EXPIRY_SOON_DAYS = 21;

export const TLS_CUTOVER_CONFIRM_MESSAGE =
  'Auf HTTPS umstellen ist unwiderruflich. Alte HTTP-Adressen und Anmeldungen gelten danach nicht mehr. TV und Tablets danach neu eintragen. Außerhalb der Öffnungszeiten wäre besser.';

export const TLS_RESET_CONFIRM_MESSAGE =
  'HTTPS-Vorbereitung verwerfen? Name, Mailtext und ACME-Delegation gehen verloren. Der Zugriff bleibt HTTP.';

export function tlsLeaseBlockedByStaleLan(lanIpStale: boolean | undefined): boolean {
  return Boolean(lanIpStale);
}

/** Lease-Schritt: feste IP erst bestätigen, wenn .env und Rechner-Adresse übereinstimmen. */
export const TLS_LEASE_STALE_LAN_COPY =
  'Die gespeicherte IP-Adresse passt nicht zur aktuellen Adresse dieses Rechners. Bitte anpassen.';

export type TlsExpiryKind = 'ok' | 'soon' | 'expired' | 'none';

export type TlsChecklistItem = { status: 'is-done' | 'is-open' | 'is-bad'; text: string };

export function tlsHttpsEligible(proxyEnabled: boolean): boolean {
  return proxyEnabled;
}

export function tlsIsOff(tls: TlsStatus | undefined): boolean {
  return !tls || tls.state === 'off';
}

/** Open TLS that belongs on the Network tab (not the install wizard). */
export function tlsNeedsNetworkResume(tls: TlsStatus | undefined): boolean {
  if (!tls || tls.state === 'off') {
    return false;
  }
  if (tls.state === 'active') {
    return tlsExpiryKind(tls.certificate) !== 'ok';
  }
  return true;
}

export function tlsExpiryKind(
  certificate: TlsCertificateStatus | null | undefined,
  now = Date.now(),
): TlsExpiryKind {
  if (!certificate?.notAfter) {
    return 'none';
  }
  const notAfter = Date.parse(certificate.notAfter);
  if (!Number.isFinite(notAfter)) {
    return 'none';
  }
  if (notAfter <= now) {
    return 'expired';
  }
  const soonMs = TLS_EXPIRY_SOON_DAYS * 24 * 60 * 60 * 1000;
  if (notAfter - now <= soonMs) {
    return 'soon';
  }
  return 'ok';
}

/** DNS-Warten: Checkliste + Warte-Copy, nicht bei error / dns-verified / obtain. */
export function tlsShowsDnsWaitCopy(tls: TlsStatus | undefined): boolean {
  return tls?.state === 'awaiting-operator-dns';
}

/** Persistierter Fail vor Cutover: Repair/Reset. Notice nur bei `lastError`. */
export function tlsIsPersistedFailBeforeCutover(tls: TlsStatus | undefined): boolean {
  return Boolean(tls && tls.state === 'error' && !tls.cutoverApplied);
}

/**
 * Apply-Fail: Graph bleibt `dns-verified` + `applyReady`; Primäraktion erneut Apply.
 * `lastError` ist hier die Autorität, nicht `state === error`.
 */
export function tlsIsApplyFail(tls: TlsStatus | undefined): boolean {
  return Boolean(
    tls &&
    tls.state === 'dns-verified' &&
    tls.applyReady &&
    !tls.cutoverApplied &&
    tls.lastError,
  );
}

/** Strukturierte Notice nur aus persistiertem `lastError`, nicht als Default neben dem Footer. */
export function tlsShowsStructuredLastErrorNotice(tls: TlsStatus | undefined): boolean {
  return Boolean(tls?.lastError && (tlsIsPersistedFailBeforeCutover(tls) || tlsIsApplyFail(tls)));
}

/** Footer nur, wenn nach Refresh kein persistiertes `lastError` für die Vor-Cutover-Gates da ist. */
export function tlsNetworkShowsGenericErrorFooter(
  tls: TlsStatus | undefined,
  error: string | null,
): boolean {
  if (!error) {
    return false;
  }
  if (!tls?.lastError) {
    return true;
  }
  return !tlsIsPersistedFailBeforeCutover(tls) && !tlsIsApplyFail(tls);
}

export function tlsCanVerifyDns(tls: TlsStatus | undefined): boolean {
  return Boolean(
    tls &&
    (tls.state === 'awaiting-operator-dns' ||
      (tls.state === 'error' && !tls.cutoverApplied && !tls.applyReady)),
  );
}

export function tlsCanObtain(tls: TlsStatus | undefined): boolean {
  return Boolean(tls && tls.state === 'dns-verified' && !tls.applyReady);
}

export function tlsCanApply(tls: TlsStatus | undefined): boolean {
  return Boolean(tls && tls.state === 'dns-verified' && tls.applyReady && !tls.cutoverApplied);
}

export function tlsCanRepair(tls: TlsStatus | undefined): boolean {
  return Boolean(tls && (tls.state === 'error' || tls.state === 'degraded'));
}

export function tlsCanResetBeforeCutover(tls: TlsStatus | undefined): boolean {
  return Boolean(tls && tls.state !== 'off' && !tls.cutoverApplied);
}

export function tlsCanRenew(tls: TlsStatus | undefined): boolean {
  if (!tls?.cutoverApplied) {
    return false;
  }
  if (tls.state === 'degraded' || tls.state === 'error') {
    return true;
  }
  const expiry = tlsExpiryKind(tls.certificate);
  return expiry === 'soon' || expiry === 'expired';
}

export function tlsNetworkSubtitle(tls: TlsStatus | undefined): string {
  if (!tls || tls.state === 'off') {
    return 'Noch nicht vorbereitet';
  }
  switch (tls.state) {
    case 'preparing':
      return 'Vorbereitung';
    case 'awaiting-operator-dns':
      return tls.hostname ? `Wartet auf DNS · ${tls.hostname}` : 'Wartet auf DNS';
    case 'dns-verified':
      return tls.applyReady ? 'Zertifikat liegt vor' : 'DNS stimmt';
    case 'obtaining-certificate':
      return 'Zertifikat wird geholt';
    case 'active':
      return tls.hostname ? `Aktiv · ${tls.hostname}` : 'Aktiv';
    case 'degraded':
      return 'Warnung';
    case 'error':
      return 'Fehler';
    default:
      return tls.state;
  }
}

export function tlsDnsWaitCopy(mode: TlsStatus['mode']): string {
  if (mode === 'custom') {
    return 'A-Record in Ihrem DNS anlegen. Nach dem Setzen kann es bis zu 48 Stunden dauern. HTTP bleibt erreichbar.';
  }
  return 'Der Eintrag erfolgt manuell. Nach dem Setzen des DNS-Eintrags kann es bis zu 48 Stunden dauern, bis dieser aktiv ist.';
}

export function tlsErrorCopy(
  errorClass: TlsErrorClass | null | undefined,
  message?: string | null,
): {
  title: string;
  action: string;
} {
  switch (errorClass) {
    case 'a-record':
      return {
        title: message?.trim() || 'A-Record fehlt.',
        action: 'Warten, bis ein eigener A-Record auf die LAN-IP zeigt.',
      };
    case 'collision':
      return {
        title: message?.trim() || 'A-Record zeigt auf eine andere IP.',
        action: 'Ein eigener A-Record zeigt auf eine andere Adresse. Label prüfen oder Mail erneut.',
      };
    case 'dns-filter':
      return {
        title: 'Öffentlicher DNS filtert die private Zieladresse.',
        action: 'Kein eigener Resolver. Praxis-IT: Filter für diesen Host prüfen.',
      };
    case 'isolation':
      return {
        title: 'Gerät erreicht den Praxisserver nicht (typisch Gast-WLAN).',
        action: 'Firewall im LAN: TCP 443 zum Praxisserver.',
      };
    case 'firewall':
      return {
        title: 'Port 443 auf diesem Rechner ist nicht erreichbar.',
        action: 'Windows-Firewall für Caddy prüfen. HTTP bleibt, bis HTTPS übernommen wird.',
      };
    case 'port-443':
      return {
        title: 'Port 443 ist belegt.',
        action: 'Den anderen Dienst beenden, dann erneut versuchen.',
      };
    case 'clock':
      return {
        title: 'Die Uhrzeit dieses Rechners wird von der Zertifizierungsstelle abgelehnt.',
        action: 'Windows-Zeit synchronisieren, dann erneut versuchen.',
      };
    case 'acme':
      return {
        title: 'Das Zertifikat konnte nicht ausgestellt werden.',
        action: 'Erneut versuchen. Das Einmal-Token nicht neu anfordern.',
      };
    case 'cert-name':
      return {
        title: 'Das Zertifikat gilt nicht für den gewählten Hostnamen.',
        action: 'Erneut versuchen oder HTTPS-Vorbereitung verwerfen.',
      };
    default:
      return { title: 'HTTPS ist fehlgeschlagen.', action: 'Erneut versuchen.' };
  }
}

export function tlsResumeCard(tls: TlsStatus | undefined): {
  title: string;
  copy: string;
  button: string;
} | null {
  if (!tlsNeedsNetworkResume(tls) || !tls) {
    return null;
  }
  const button = 'Fortsetzen';
  if (tlsShowsDnsWaitCopy(tls)) {
    return {
      title: tlsNetworkSubtitle(tls),
      copy: `${tlsDnsWaitCopy(tls.mode)} Den Manager schließen ist in Ordnung.`,
      button,
    };
  }
  if (tlsIsPersistedFailBeforeCutover(tls)) {
    if (tls.lastError) {
      const fail = tlsErrorCopy(tls.lastError.class, tls.lastError.message);
      return { title: fail.title, copy: fail.action, button };
    }
    return { title: tlsNetworkSubtitle(tls), copy: 'HTTP läuft weiter.', button };
  }
  if (tlsIsApplyFail(tls)) {
    const fail = tlsErrorCopy(tls.lastError?.class, tls.lastError?.message);
    return {
      title: tlsNetworkSubtitle(tls),
      copy: `${fail.title} ${fail.action}`,
      button,
    };
  }
  if (tls.cutoverApplied) {
    const expiry = tlsExpiryKind(tls.certificate);
    return {
      title:
        expiry === 'expired'
          ? 'Zertifikat abgelaufen'
          : tls.state === 'error'
            ? tlsNetworkSubtitle(tls)
            : 'HTTPS braucht Aufmerksamkeit',
      copy: 'Geräte nutzen HTTPS.',
      button,
    };
  }
  if (tls.state === 'obtaining-certificate') {
    return {
      title: tlsNetworkSubtitle(tls),
      copy: 'HTTP bleibt erreichbar.',
      button,
    };
  }
  if (tls.state === 'dns-verified') {
    return {
      title: tlsNetworkSubtitle(tls),
      copy: tls.applyReady
        ? 'HTTP bleibt, bis Sie auf HTTPS umstellen.'
        : 'Als Nächstes das Zertifikat holen — noch nicht umstellen.',
      button,
    };
  }
  return {
    title: tlsNetworkSubtitle(tls),
    copy: 'HTTP bleibt erreichbar.',
    button,
  };
}

export function tlsDiagnoseItems(input: {
  tls: TlsStatus;
  ipv4Reserved: boolean;
  checks: TlsDnsCheck[] | null;
}): TlsChecklistItem[] {
  const dnsVerified =
    input.tls.state === 'dns-verified' ||
    input.tls.state === 'obtaining-certificate' ||
    input.tls.state === 'active' ||
    input.tls.state === 'degraded';
  const fromChecks = (
    id: TlsDnsCheck['id'],
    fallback: string,
  ): TlsChecklistItem => {
    const check = input.checks?.find((item) => item.id === id);
    if (check) {
      const text =
        check.detail && !check.message.includes(check.detail)
          ? `${check.message} (${check.detail})`
          : check.message;
      return { status: check.ok ? 'is-done' : 'is-bad', text };
    }
    return {
      status: dnsVerified ? 'is-done' : 'is-open',
      text: fallback,
    };
  };
  const items: TlsChecklistItem[] = [
    { status: 'is-done', text: 'Server hat eine IPv4-Adresse' },
    {
      status: input.ipv4Reserved ? 'is-done' : 'is-open',
      text: 'feste IP / DHCP-Reservierung bestätigt',
    },
    fromChecks('a-record', 'Öffentlicher A-Record zeigt auf diese IP'),
  ];
  if (input.tls.mode !== 'custom') {
    items.push(fromChecks('acme-cname', 'ACME-CNAME gesetzt'));
  }
  return items;
}

export function tlsLocalCheckItems(input: {
  tls: TlsStatus;
  checks: TlsLocalCheck[] | null;
}): TlsChecklistItem[] {
  const obtaining = input.tls.state === 'obtaining-certificate';
  const ready = input.tls.applyReady;
  const labels: Record<TlsLocalCheck['id'], string> = {
    certificate: 'Zertifikatskette und Name',
    'tcp-443': 'TCP 443 lokal',
    http2: 'HTTP/2',
    sse: 'SSE-Tick',
  };
  const ids: TlsLocalCheck['id'][] = ['tcp-443', 'certificate', 'http2', 'sse'];
  return ids.map((id) => {
    const check = input.checks?.find((item) => item.id === id);
    if (check) {
      return { status: check.ok ? 'is-done' : 'is-bad', text: check.message || labels[id] };
    }
    if (obtaining) {
      return { status: 'is-open', text: `${labels[id]} — läuft` };
    }
    return { status: ready ? 'is-done' : 'is-open', text: labels[id] };
  });
}

export function formatCertNotAfter(certificate: TlsCertificateStatus | null): string {
  if (!certificate?.notAfter) {
    return '—';
  }
  const parsed = Date.parse(certificate.notAfter);
  if (!Number.isFinite(parsed)) {
    return certificate.notAfter;
  }
  return new Date(parsed).toLocaleDateString('de-DE');
}
