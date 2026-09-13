/** Portable LAN-TLS backup inspect helpers (no DOM). */

export {
  TLS_SIDECAR_BASENAME_PREFIX,
  TLS_SIDECAR_FILE_EXTENSION,
  siblingTlsSidecarBasename,
  tlsSidecarFileName,
} from './backup-path-labels.js';

const TLS_PREPARED_BACKUP_STATES = new Set([
  'preparing',
  'awaiting-operator-dns',
  'dns-verified',
  'obtaining-certificate',
  'error',
]);

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
export function tlsInBackup(input: { canonicalBaseUrl?: unknown; proxyMode?: unknown }): boolean {
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
  backupInstallationDomain?: unknown;
  backupStaffHostname?: unknown;
  backupPortalHostname?: unknown;
  backupWildcardCertificateName?: unknown;
  sidecarInstallId?: unknown;
  sidecarHostname?: unknown;
  sidecarInstallationDomain?: unknown;
  sidecarStaffHostname?: unknown;
  sidecarPortalHostname?: unknown;
  sidecarWildcardCertificateName?: unknown;
}): boolean {
  const backupId = String(input.backupInstallId ?? '').trim();
  const sidecarId = String(input.sidecarInstallId ?? '').trim();
  const backupHost = normalizeOwnDomain(input.backupHostname);
  const sidecarHost = normalizeOwnDomain(input.sidecarHostname);
  const baseMatches =
    Boolean(backupId) &&
    Boolean(sidecarId) &&
    Boolean(backupHost) &&
    Boolean(sidecarHost) &&
    backupId === sidecarId &&
    backupHost === sidecarHost;
  if (!baseMatches) {
    return false;
  }

  const managedPairs = [
    [input.backupInstallationDomain, input.sidecarInstallationDomain],
    [input.backupStaffHostname, input.sidecarStaffHostname],
    [input.backupPortalHostname, input.sidecarPortalHostname],
    [input.backupWildcardCertificateName, input.sidecarWildcardCertificateName],
  ] as const;
  const managedMarkerPairs = [managedPairs[0], managedPairs[2], managedPairs[3]];
  const hasManagedIdentity = managedMarkerPairs.some(([backup, sidecar]) =>
    Boolean(normalizeOwnDomain(backup) || normalizeOwnDomain(sidecar)),
  );
  const backupStaff = normalizeOwnDomain(input.backupStaffHostname);
  const sidecarStaff = normalizeOwnDomain(input.sidecarStaffHostname);
  if (!hasManagedIdentity) {
    return !backupStaff && !sidecarStaff
      ? true
      : Boolean(backupStaff && backupStaff === sidecarStaff);
  }
  return managedPairs.every(([backup, sidecar]) => {
    const backupValue = normalizeOwnDomain(backup);
    const sidecarValue = normalizeOwnDomain(sidecar);
    return Boolean(backupValue) && backupValue === sidecarValue;
  });
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
  if (
    !input.tlsMetadataConsistent ||
    !input.tlsPrepared ||
    (input.sidecarPresent && input.sidecarMatches)
  ) {
    return null;
  }
  return 'Diese Sicherung enthält nur eine vorbereitete HTTPS-Einrichtung, noch kein aktives Zertifikat. Wiederherstellen bleibt möglich; ohne die dazugehörige Zertifikatsdatei wird die Vorbereitung verworfen.';
}

/** restoreInspectBlockedMessage when restoreSupported is false because of TLS. */
export function tlsRestoreBlockedCopy(input: {
  tlsMetadataConsistent: boolean;
  tlsClaimsHttps: boolean;
  sidecarPresent: boolean;
  sidecarMatches: boolean;
}): string | null {
  if (!input.tlsMetadataConsistent) {
    return 'Die HTTPS-Angaben in dieser Sicherung passen nicht zusammen. Wiederherstellen wird abgelehnt.';
  }
  if (!input.tlsClaimsHttps) {
    return null;
  }
  if (!input.sidecarPresent) {
    return 'Diese Sicherung erwartet HTTPS, aber die Zertifikatsdatei fehlt. Wiederherstellen würde Geräte auf https:// stellen ohne Zertifikat — deshalb abgelehnt.';
  }
  if (!input.sidecarMatches) {
    return 'Die Zertifikatsdatei gehört zu einer anderen Installation oder einem anderen Hostnamen.';
  }
  return null;
}
