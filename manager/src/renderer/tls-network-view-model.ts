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
    return 'A-Record in Ihrem DNS anlegen. Tage sind normal. HTTP bleibt erreichbar.';
  }
  return 'Mail ist raus, DNS kommt vom Betreiber. Tage sind normal. HTTP bleibt erreichbar.';
}

export function tlsErrorCopy(errorClass: TlsErrorClass | null | undefined): {
  title: string;
  action: string;
} {
  switch (errorClass) {
    case 'a-record':
      return {
        title: 'A-Record fehlt oder zeigt nicht auf diesen Rechner.',
        action: 'Warten oder Mail erneut senden, sobald der Eintrag steht.',
      };
    case 'collision':
      return {
        title: 'A-Record zeigt auf eine andere IP — Name ist vergeben.',
        action: 'Anderes Label wählen und neue Mail an Praxis Flow.',
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
        title: 'Port 443 ist lokal nicht erreichbar.',
        action: 'Windows-Firewall für Caddy / Praxis Flow prüfen.',
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
        title: 'Zertifikat konnte nicht ausgestellt werden (ACME).',
        action: 'Erneut versuchen. Das Einmal-Token nicht neu anzeigen.',
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
  if (tls.state === 'error') {
    return {
      title: 'HTTPS fehlgeschlagen',
      copy: 'HTTP läuft weiter. Fortsetzen unter Netzwerk.',
      button: 'Fortsetzen',
    };
  }
  if (tls.state === 'obtaining-certificate') {
    return {
      title: 'Zertifikat wird geholt',
      copy: 'HTTP bleibt erreichbar. Fortsetzen unter Netzwerk.',
      button: 'Fortsetzen',
    };
  }
  if (tls.state === 'dns-verified') {
    return {
      title: tls.applyReady ? 'Zertifikat liegt vor' : 'DNS stimmt',
      copy: tls.applyReady
        ? 'HTTP bleibt, bis Sie unter Netzwerk auf HTTPS umstellen.'
        : 'Als Nächstes unter Netzwerk das Zertifikat holen — noch nicht umstellen.',
      button: 'Fortsetzen',
    };
  }
  if (tls.state === 'degraded' || (tls.state === 'active' && tlsExpiryKind(tls.certificate) !== 'ok')) {
    return {
      title: tlsExpiryKind(tls.certificate) === 'expired' ? 'Zertifikat abgelaufen' : 'HTTPS braucht Aufmerksamkeit',
      copy: 'Weiter unter Netzwerk.',
      button: 'Fortsetzen',
    };
  }
  return {
    title: 'HTTPS wartet auf DNS',
    copy: `${tlsDnsWaitCopy(tls.mode)} Fortsetzen unter Netzwerk. Den Manager schließen ist in Ordnung.`,
    button: 'Fortsetzen',
  };
}

function dnsOkLabel(verified: boolean, fallback: string, waitingLabel: string): string {
  return verified ? fallback : `${fallback}${waitingLabel}`;
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
  const fromChecks = (id: TlsDnsCheck['id'], fallback: string, waitingLabel: string): TlsChecklistItem => {
    const check = input.checks?.find((item) => item.id === id);
    if (check) {
      return { status: check.ok ? 'is-done' : 'is-bad', text: check.message };
    }
    return {
      status: dnsVerified ? 'is-done' : 'is-open',
      text: dnsOkLabel(dnsVerified, fallback, waitingLabel),
    };
  };
  const items: TlsChecklistItem[] = [
    { status: 'is-done', text: 'Server hat eine IPv4-Adresse' },
    {
      status: input.ipv4Reserved ? 'is-done' : 'is-open',
      text: 'feste IP / DHCP-Reservierung bestätigt',
    },
    fromChecks('a-record', 'Öffentlicher A-Record zeigt auf diese IP', ' — Tage sind normal'),
  ];
  if (input.tls.mode !== 'custom') {
    items.push(fromChecks('acme-cname', 'ACME-CNAME gesetzt', ' — Tage sind normal'));
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
