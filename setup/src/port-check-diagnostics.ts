import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import type { PortCheckReport, PortCheckRow } from '@wartezimmer/server-shared/setup-api';
import { storePortFailure } from './port-check-history.js';
type PortError = NonNullable<PortCheckReport['error']>;
export function classifyPortFailure(
  stderr: string,
  row: Pick<PortCheckRow, 'hostIp' | 'publishedPort'> | undefined,
  macDesktop: boolean,
  platform: NodeJS.Platform = process.platform,
): PortError {
  const address =
    row && (isIP(row.hostIp) === 6 ? '[' + row.hostIp + ']' : row.hostIp) + ':' + row.publishedPort;
  // Winsock may return a localized message without the error number. Remove
  // endpoint ports before looking for codes, since all three are valid ports.
  const winsock =
    platform === 'win32'
      ? stderr.replace(/(?:\[[^\]\s]+\]|(?:\d{1,3}\.){3}\d{1,3}):\d+\b/g, '')
      : '';
  const lines = stderr.trim().split(/\r?\n/);
  const detail = (
    lines.find((line) => /bind|expos|forwar|allocated|permission|unavailable/i.test(line)) ??
    lines[0]
  )
    ?.replace(/\t/g, ' ')
    .slice(0, 580);
  if (
    /address already in use|port is already allocated|only one usage/i.test(stderr) ||
    /\b(?:10048|WSAEADDRINUSE)\b|socketadresse.*nur (?:jeweils )?einmal|nur eine verwendung.*socketadresse/i.test(
      winsock,
    )
  )
    return {
      kind: 'occupied',
      message:
        (address ?? 'Einer der geplanten Ports') +
        ' ist bereits belegt. Prüfen Sie laufende Dienste und Container.',
      detail,
    };
  if (
    /cannot assign requested address|address not available/i.test(stderr) ||
    /\b(?:10049|WSAEADDRNOTAVAIL)\b|address is not valid in its context|adresse ist (?:in diesem|im) kontext ungültig/i.test(
      winsock,
    )
  )
    return {
      kind: 'address',
      message:
        (address ?? 'Eine der geplanten Adressen') +
        ' ist an diesem Rechner nicht verfügbar. Bitte prüfen Sie die gewählte Netzwerkadresse.',
      detail,
    };
  const permission =
    /permission denied|operation not permitted|access.*forbidden|privileged port|port forwarding to external/i.test(
      stderr,
    ) ||
    /\b(?:10013|WSAEACCES)\b|zugriffs(?:rechte|berechtigungen).*(?:verboten|unzulässig|untersagt)/i.test(
      winsock,
    );
  if (
    /Cannot bind privileged port|Allow privileged port forwarding to external machines/i.test(
      stderr,
    ) &&
    macDesktop &&
    row &&
    !row.hostIp.startsWith('127.') &&
    !['0.0.0.0', '::', '::1'].includes(row.hostIp) &&
    row.publishedPort <= 1024
  )
    return {
      kind: 'mac-permission',
      message:
        'Docker konnte ' +
        address +
        ' im LAN nicht freigeben. Prüfen Sie die Freigabe für externe Geräte in Docker Desktop.',
      detail,
    };
  if (permission)
    return {
      kind: 'permission',
      message:
        (address ? 'Die Portbindung ' + address : 'Eine der geplanten Portbindungen') +
        ' wurde verweigert. ' +
        (platform === 'win32'
          ? 'Prüfen Sie reservierte Ports und exklusive Windows-Dienste.'
          : macDesktop &&
              row &&
              row.publishedPort <= 1024 &&
              !['0.0.0.0', '::', '::1'].includes(row.hostIp) &&
              !row.hostIp.startsWith('127.')
            ? 'Prüfen Sie unter Docker Desktop → Settings → Advanced die Freigabe niedriger Ports für externe Geräte. Docker nennt keine eindeutige Ursache.'
            : platform === 'linux'
              ? 'Prüfen Sie bei einer Rootless Engine, ab welchem Port der Benutzer Dienste veröffentlichen darf.'
              : 'Prüfen Sie die Berechtigung der verwendeten Docker Engine für diesen Host-Port.'),
      detail,
    };
  return {
    kind: 'technical',
    message: address
      ? 'Docker konnte die Veröffentlichung auf ' + address + ' nicht bestätigen.'
      : 'Docker konnte die geplanten Ports nicht gemeinsam freigeben. Prüfen Sie die technischen Details.',
    detail,
  };
}

/** Keep the requested endpoint, even if Docker also names its wildcard fallback. */
export function portFailureEndpoint(stderr: string) {
  for (const line of stderr.split(/\r?\n/)) {
    const match =
      /(?:exposing port (TCP|UDP)\s+|listen (tcp|udp)[46]?\s+|bind for\s+|failed to bind host port(?: for)?\s+)(\[[0-9a-f:.]+\]|[0-9.]+):(\d+)\b(?:\/(tcp|udp)\b)?/i.exec(
        line,
      );
    if (!match) continue;
    const hostIp = match[3]!.replace(/^\[|\]$/g, ''),
      publishedPort = Number(match[4]);
    if (!isIP(hostIp) || publishedPort < 1 || publishedPort > 65535) continue;
    return {
      hostIp,
      publishedPort,
      protocol: (match[1] ?? match[2] ?? match[5])?.toLowerCase(),
      detail: line.slice(match.index, match.index + 580),
    };
  }
}
export function publishedPortFailure(
  stderr: string,
  platform: NodeJS.Platform = process.platform,
): PortCheckReport | undefined {
  const endpoint = portFailureEndpoint(stderr);
  if (!endpoint) return;
  return {
    id: randomUUID(),
    at: new Date().toISOString(),
    phase: 'publish',
    platform,
    rows: [],
    error: classifyPortFailure(
      endpoint.detail,
      endpoint,
      platform === 'darwin' &&
        /Allow privileged port forwarding to external machines/i.test(endpoint.detail),
      platform,
    ),
  };
}
export function recordPublishFailure(home: string, stderr: string): void {
  const report = publishedPortFailure(stderr);
  if (report) storePortFailure(home, report);
}
