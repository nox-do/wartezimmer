/**
 * Portable LAN-TLS backup inspect helpers.
 * Lifted from docs/mocks/lan-tls-wizard/tls-model.js (no DOM / SAMPLE).
 */

import { parsePfbackupTimestampTokenFromPath } from './backup-path-labels.js';

export const TLS_SIDECAR_BASENAME_PREFIX = 'praxis-flow-tls-';
export const TLS_SIDECAR_FILE_EXTENSION = 'tgz';

const TLS_PREPARED_BACKUP_STATES = new Set([
  'preparing',
  'awaiting-operator-dns',
  'dns-verified',
  'obtaining-certificate',
  'error',
]);

/** Sidecar next to `.pfbackup`, same timestamp token. Pilot; later inside the archive. */
export function tlsSidecarFileName(timestamp: string): string {
  return `${TLS_SIDECAR_BASENAME_PREFIX}${timestamp}.${TLS_SIDECAR_FILE_EXTENSION}`;
}

export function siblingTlsSidecarBasename(backupPath: string): string | null {
  const timestamp = parsePfbackupTimestampTokenFromPath(backupPath);
  return timestamp ? tlsSidecarFileName(timestamp) : null;
}

function normalizeOwnDomain(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
}

/**
 * Inspect: backup claims HTTPS. Gate is .env after apply, not tls.state.
 * prepare-only backups stay HTTP in Canonical — sidecar still saved, no Inspect-block.
 */
export function tlsInBackup(input: {
  canonicalBaseUrl?: unknown;
  proxyMode?: unknown;
}): boolean {
  const canonical = String(input.canonicalBaseUrl ?? '');
  const mode = String(input.proxyMode ?? '');
  return canonical.startsWith('https://') || mode === 'tls-managed' || mode === 'tls-custom';
}

/** Non-secret TLS_STATE marker: preparation exists, but Canonical is still HTTP. */
export function tlsPreparedInBackup(input: {
  tlsState?: unknown;
  tlsClaimsHttps: boolean;
}): boolean {
  const state = String(input.tlsState ?? 'off');
  return !input.tlsClaimsHttps && TLS_PREPARED_BACKUP_STATES.has(state);
}

/** Reject contradictory state/env combinations instead of silently downgrading. */
export function tlsBackupMetadataConsistent(input: {
  tlsState?: unknown;
  tlsClaimsHttps: boolean;
}): boolean {
  const state = String(input.tlsState ?? 'off');
  if (state === 'active' || state === 'degraded') {
    return Boolean(input.tlsClaimsHttps);
  }
  if (state === 'off' || TLS_PREPARED_BACKUP_STATES.has(state)) {
    return !input.tlsClaimsHttps || state === 'error';
  }
  return false;
}

export function tlsSidecarMatches(input: {
  backupInstallId?: unknown;
  backupHostname?: unknown;
  sidecarInstallId?: unknown;
  sidecarHostname?: unknown;
}): boolean {
  const backupId = String(input.backupInstallId ?? '').trim();
  const sidecarId = String(input.sidecarInstallId ?? '').trim();
  const backupHost = normalizeOwnDomain(input.backupHostname);
  const sidecarHost = normalizeOwnDomain(input.sidecarHostname);
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
export function tlsRestoreSupported(input: {
  archiveValid: boolean;
  settingsValid: boolean;
  targetAppReachable: boolean;
  tlsMetadataConsistent: boolean;
  tlsClaimsHttps: boolean;
  sidecarPresent: boolean;
  sidecarMatches: boolean;
}): boolean {
  if (
    !input.archiveValid ||
    !input.settingsValid ||
    !input.targetAppReachable ||
    !input.tlsMetadataConsistent
  ) {
    return false;
  }
  if (!input.tlsClaimsHttps) {
    return true;
  }
  return Boolean(input.sidecarPresent && input.sidecarMatches);
}

/** Prepare-only restore stays HTTP and may discard an unavailable staged journey. */
export function tlsRestoreWarningCopy(input: {
  tlsMetadataConsistent: boolean;
  tlsPrepared: boolean;
  sidecarPresent: boolean;
  sidecarMatches: boolean;
}): string | null {
  if (!input.tlsMetadataConsistent || !input.tlsPrepared || (input.sidecarPresent && input.sidecarMatches)) {
    return null;
  }
  return 'Diese Sicherung enthält nur eine noch nicht aktive HTTPS-Vorbereitung. Wiederherstellen bleibt möglich; ohne passendes Sidecar wird die Vorbereitung verworfen und HTTPS steht danach auf „aus“.';
}

/** restoreInspectBlockedMessage when restoreSupported is false because of TLS. */
export function tlsRestoreBlockedCopy(input: {
  tlsMetadataConsistent: boolean;
  tlsClaimsHttps: boolean;
  sidecarPresent: boolean;
  sidecarMatches: boolean;
}): string | null {
  if (!input.tlsMetadataConsistent) {
    return 'Die HTTPS-Angaben in dieser Sicherung widersprechen sich. Wiederherstellen wird abgelehnt, damit weder HTTPS-State noch Canonical still zurückgestuft werden.';
  }
  if (!input.tlsClaimsHttps) {
    return null;
  }
  if (!input.sidecarPresent) {
    return 'Diese Sicherung erwartet HTTPS, aber der HTTPS-State (Sidecar) fehlt. Wiederherstellen würde Geräte auf https:// zeigen ohne Zertifikat — abgelehnt, kein Zurück auf HTTP.';
  }
  if (!input.sidecarMatches) {
    return 'Der HTTPS-State gehört zu einer anderen Installation (ID oder Hostname). Restore nur auf dieselbe ID und denselben Hostnamen.';
  }
  return null;
}
