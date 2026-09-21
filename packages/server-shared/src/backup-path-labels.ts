/** Browser-safe backup filename helpers (no Node crypto). */

export const PFBACKUP_FILE_EXTENSION = 'pfbackup';
export const PFBACKUP_BASENAME_PREFIX = 'praxis-flow-backup-';

const PFBACKUP_TIMESTAMP_TOKEN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/;

export function parsePfbackupTimestampTokenFromPath(backupPath: string): string | null {
  const base = backupPath.replace(/\\/g, '/').split('/').pop() ?? backupPath;
  if (!base.startsWith(PFBACKUP_BASENAME_PREFIX) || !base.endsWith(`.${PFBACKUP_FILE_EXTENSION}`)) {
    return null;
  }
  const encoded = base.slice(
    PFBACKUP_BASENAME_PREFIX.length,
    base.length - `.${PFBACKUP_FILE_EXTENSION}`.length,
  );
  return PFBACKUP_TIMESTAMP_TOKEN.test(encoded) ? encoded : null;
}

export function parsePfbackupTimestampFromPath(backupPath: string): Date | null {
  const encoded = parsePfbackupTimestampTokenFromPath(backupPath);
  if (!encoded) {
    return null;
  }
  const match = encoded.match(PFBACKUP_TIMESTAMP_TOKEN);
  if (!match) {
    return null;
  }
  const [, year, month, day, hour, minute, second, millis] = match;
  return new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
      Number(millis),
    ),
  );
}

export function formatPfbackupLabel(backupPath: string, locale = 'de-DE'): string {
  const date = parsePfbackupTimestampFromPath(backupPath);
  if (!date) {
    const base = backupPath.replace(/\\/g, '/').split('/').pop();
    return base ?? backupPath;
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
