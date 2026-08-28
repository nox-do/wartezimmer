import {
  TLS_OPERATOR_MAIL,
  TLS_OPERATOR_ZONE_DEFAULT,
  type TlsMode,
} from '@praxis-flow/server-shared';

export const TLS_OPERATOR_ZONE = TLS_OPERATOR_ZONE_DEFAULT;
export { TLS_OPERATOR_MAIL };

export type TlsNameMode = 'generated' | 'label' | 'domain';

const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const DNS_HOSTNAME =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const RESERVED_LABELS = new Set(['lan', 'acme', 'www', 'portal', 'mail']);

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

export function operatorMailSubject(hostname: string): string {
  return `Praxis Flow TLS-DNS — ${hostname}`;
}

export function operatorZoneMailBody(input: {
  hostname: string;
  lanIp: string;
  installationId: string;
  token?: string | null;
  tokenConsumed: boolean;
  acmeCnameTarget: string | null;
}): string {
  const tokenLine = input.tokenConsumed
    ? 'Einmal-Token:      (bereits verwendet, nicht erneut anzeigen)'
    : `Einmal-Token:      ${input.token ?? '…'}`;
  const cnameTarget = (input.acmeCnameTarget || '').replace(/\.$/, '');
  const cnameLine = cnameTarget
    ? `_acme-challenge.${input.hostname}.   CNAME  ${cnameTarget}.`
    : `_acme-challenge.${input.hostname}.   CNAME  (nach Vorbereitung)`;
  return [
    `Installations-ID:  ${input.installationId}`,
    tokenLine,
    `Hostname:          ${input.hostname}`,
    `LAN-IP:            ${input.lanIp}`,
    '',
    'Bitte anlegen:',
    '',
    `${input.hostname}.                   A      ${input.lanIp}`,
    cnameLine,
  ].join('\n');
}

export function practiceARecordBody(hostname: string, lanIp: string): string {
  return `${hostname}.                   A      ${lanIp}`;
}

export function mailtoHref(to: string, subject: string, body: string): string {
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
