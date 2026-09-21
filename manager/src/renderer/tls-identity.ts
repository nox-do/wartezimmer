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
  return (
    DNS_HOSTNAME.test(host) &&
    host.includes('.') &&
    host !== TLS_OPERATOR_ZONE &&
    !host.endsWith(`.${TLS_OPERATOR_ZONE}`)
  );
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
    ...(input.portalHostname ? [`Portal-Hostname:   ${input.portalHostname}`] : []),
    ...(input.wildcardCertificateName
      ? [`Zertifikatsname:  ${input.wildcardCertificateName}`]
      : []),
    `LAN-IP:            ${input.lanIp}`,
    '',
    'Bitte anlegen:',
    '',
    `${staffHostname}.                   A      ${input.lanIp}`,
    ...(input.portalHostname
      ? [`${input.portalHostname}.                   A      <PORTAL-ZIEL-IP>`]
      : []),
    cnameLine,
    '',
    ...(input.portalHostname
      ? [
          'Vor dem Versand: <PORTAL-ZIEL-IP> durch die mit der Praxis-IT festgelegte feste private IPv4 für den separaten Portalzugang ersetzen.',
          'Bitte den Portal-A-Record bereits jetzt anlegen. Der separate Portalzugang wird später im Manager aktiviert; die DNS-Anlage allein aktiviert ihn nicht.',
          '',
        ]
      : []),
    'Der abschließende Punkt kennzeichnet einen vollständigen DNS-Namen. Falls Ihr DNS-Anbieter diesen im Eingabeformular nicht akzeptiert, lassen Sie nur den letzten Punkt weg.',
  ].join('\n');
}

export function practiceARecordBody(hostname: string, lanIp: string): string {
  return `${hostname}.                   A      ${lanIp}`;
}

export function mailtoHref(to: string, subject: string, body: string): string {
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
