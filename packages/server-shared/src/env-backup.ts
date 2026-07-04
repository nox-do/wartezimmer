/** Basename prefix for `.env` backups in the install home (see `buildEnvBackupPath`). */
export const ENV_BACKUP_BASENAME_PREFIX = '.env.backup-';

/**
 * Filesystem-safe UTC timestamp for backup filenames.
 * ISO-8601 with `:` and `.` replaced by `-` (same rules on all platforms).
 */
export function encodeEnvBackupTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

/** Parses the timestamp suffix from `encodeEnvBackupTimestamp`. */
export function decodeEnvBackupTimestamp(suffix: string): Date | null {
  const t = suffix.indexOf('T');
  if (t === -1 || !suffix.endsWith('Z')) {
    return null;
  }

  const [hours, minutes, seconds, millis] = suffix.slice(t + 1, -1).split('-');
  if (!hours || !minutes || !seconds || !millis) {
    return null;
  }

  const iso = `${suffix.slice(0, t)}T${hours}:${minutes}:${seconds}.${millis}Z`;
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function buildEnvBackupPath(envPath: string, date = new Date()): string {
  return `${envPath}.backup-${encodeEnvBackupTimestamp(date)}`;
}

export function parseEnvBackupTimestampFromPath(backupPath: string): Date | null {
  const base = backupPath.replace(/\\/g, '/').split('/').pop() ?? backupPath;
  if (!base.startsWith(ENV_BACKUP_BASENAME_PREFIX)) {
    return null;
  }
  return decodeEnvBackupTimestamp(base.slice(ENV_BACKUP_BASENAME_PREFIX.length));
}

export function formatEnvBackupLabel(backupPath: string, locale = 'de-DE'): string {
  const date = parseEnvBackupTimestampFromPath(backupPath);
  if (!date) {
    const base = backupPath.replace(/\\/g, '/').split('/').pop();
    return base ?? backupPath;
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
