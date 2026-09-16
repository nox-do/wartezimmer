import {
  TLS_OPERATOR_MAIL,
  TLS_OPERATOR_ZONE_DEFAULT,
  type TlsMode,
} from '@praxis-flow/server-shared/setup-api';

export const TLS_OPERATOR_ZONE = TLS_OPERATOR_ZONE_DEFAULT;
export { TLS_OPERATOR_MAIL };

export type TlsNameMode = 'generated' | 'label' | 'domain';

const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const DNS_HOSTNAME =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const RESERVED_LABELS = new Set(['lan', 'acme', 'www', 'staff', 'portal', 'mail']);

export function normalizeTlsHostnameInput(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, '');
}

export function isOwnDomainNameMode(nameMode: TlsNameMode): boolean {
  return nameMode === 'domain';
}

export function tlsModeForNameMode(nameMode: TlsNameMode): TlsMode {
  return nameMode === 'domain' ? 'custom' : 'managed';
}

export function tlsNameValid(input: {
  nameMode: TlsNameMode;
  customLabel: string;
  customDomain: string;
}): boolean {
  if (input.nameMode === 'generated') {
    return true;
  }
  if (input.nameMode === 'label') {
    const label = input.customLabel.trim().toLowerCase();
    return DNS_LABEL.test(label) && !RESERVED_LABELS.has(label);
  }
  const host = normalizeTlsHostnameInput(input.customDomain);
  return DNS_HOSTNAME.test(host) && host.includes('.') && !host.endsWith(`.${TLS_OPERATOR_ZONE}`);
}

/** Hostname to send on prepare. `undefined` lets Setup mint the 6-character label. */
export function tlsPrepareHostname(input: {
  nameMode: TlsNameMode;
  customLabel: string;
  customDomain: string;
}): string | undefined {
  if (input.nameMode === 'generated') {
    return undefined;
  }
  if (input.nameMode === 'label') {
    return `${input.customLabel.trim().toLowerCase()}.${TLS_OPERATOR_ZONE}`;
  }
  return normalizeTlsHostnameInput(input.customDomain);
}

/** Preview before prepare mints a generated label. */
export function tlsDraftHostname(input: {
  nameMode: TlsNameMode;
  customLabel: string;
  customDomain: string;
}): string {
  if (input.nameMode === 'generated') {
    return `staff.….${TLS_OPERATOR_ZONE}`;
  }
  if (input.nameMode === 'label') {
    const label = input.customLabel.trim().toLowerCase() || '…';
    return `staff.${label}.${TLS_OPERATOR_ZONE}`;
  }
  return normalizeTlsHostnameInput(input.customDomain) || 'flow.praxis.example';
}

/** Same fork and hostname as the prepared host identity (generated stays generated). */
export function tlsDraftMatchesPrepared(
  draft: {
    nameMode: TlsNameMode;
    customLabel: string;
    customDomain: string;
    preparedNameMode?: TlsNameMode | null;
  },
  tls:
    | {
        mode: TlsMode | null;
        hostname: string | null;
        installationDomain?: string | null;
        state: string;
      }
    | null
    | undefined,
): boolean {
  if (!tls || tls.state === 'off' || tls.mode == null) {
    return false;
  }
  if (tlsModeForNameMode(draft.nameMode) !== tls.mode) {
    return false;
  }
  const prepared = draft.preparedNameMode ?? null;
  if (draft.nameMode === 'generated') {
    return prepared === null || prepared === 'generated';
  }
  if (prepared && prepared !== draft.nameMode) {
    return false;
  }
  const hostname = tlsPrepareHostname(draft);
  const preparedIdentity = tls.mode === 'managed' ? tls.installationDomain : tls.hostname;
  if (!hostname || !preparedIdentity) {
    return false;
  }
  return normalizeTlsHostnameInput(preparedIdentity) === hostname;
}

/** Minted host while the draft still matches; otherwise the live draft preview. */
export function tlsWizardDisplayHostname(
  draft: {
    nameMode: TlsNameMode;
    customLabel: string;
    customDomain: string;
    preparedNameMode?: TlsNameMode | null;
  },
  tls:
    | {
        mode: TlsMode | null;
        hostname: string | null;
        staffHostname?: string | null;
        installationDomain?: string | null;
        state: string;
      }
    | null
    | undefined,
): string {
  if (tlsDraftMatchesPrepared(draft, tls) && tls?.hostname) {
    return tls.staffHostname || tls.hostname;
  }
  return tlsDraftHostname(draft);
}

export function operatorMailSubject(hostname: string): string {
  return `Praxis Flow TLS-DNS — ${hostname}`;
}

export function operatorZoneMailBody(input: {
  hostname: string;
  installationDomain?: string | null;
  staffHostname?: string | null;
  portalHostname?: string | null;
  wildcardCertificateName?: string | null;
  acmeCnameName?: string | null;
  lanIp: string;
  installationId: string;
  token?: string | null;
  tokenConsumed: boolean;
  acmeCnameTarget: string | null;
}): string {
  const staffHostname = input.staffHostname || input.hostname;
  const installationDomain = input.installationDomain || staffHostname;
  const acmeCnameName = input.acmeCnameName || `_acme-challenge.${installationDomain}`;
  const tokenLine = input.tokenConsumed
    ? 'Einmal-Token:      (bereits verwendet, nicht erneut anzeigen)'
    : `Einmal-Token:      ${input.token ?? '…'}`;
  const cnameTarget = (input.acmeCnameTarget || '').replace(/\.$/, '');
  const cnameLine = cnameTarget
    ? `${acmeCnameName}.   CNAME  ${cnameTarget}.`
    : `${acmeCnameName}.   CNAME  (nach Vorbereitung)`;
  return [
    `Installations-ID:  ${input.installationId}`,
    tokenLine,
    `Installationsraum: ${installationDomain}`,
    `Staff-Hostname:    ${staffHostname}`,
    ...(input.portalHostname
      ? [`Portal reserviert: ${input.portalHostname} (noch kein A-Record)`]
      : []),
    ...(input.wildcardCertificateName
      ? [`Zertifikatsname:  ${input.wildcardCertificateName}`]
      : []),
    `LAN-IP:            ${input.lanIp}`,
    '',
    'Bitte anlegen:',
    '',
    `${staffHostname}.                   A      ${input.lanIp}`,
    cnameLine,
    '',
    'Der abschließende Punkt kennzeichnet einen vollständigen DNS-Namen. Falls Ihr DNS-Anbieter diesen im Eingabeformular nicht akzeptiert, lassen Sie nur den letzten Punkt weg.',
  ].join('\n');
}

export function practiceARecordBody(hostname: string, lanIp: string): string {
  return `${hostname}.                   A      ${lanIp}`;
}

export function mailtoHref(to: string, subject: string, body: string): string {
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
