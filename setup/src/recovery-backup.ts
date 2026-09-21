import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  parsePfbackupArchive,
  validatePfbackupArchive,
  type RecoveryBackupCandidate,
} from '@praxis-flow/server-shared';
import { buildPfbackupTlsInspectSummary } from './tls-backup-sidecar.js';
import { installOperationDirectory, type InstallOperation } from './install-operation.js';

const digest = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const candidateId = (name: string) => digest(name);
const backupDirectory = (home: string) => path.join(home, 'backups');

export function inspectRecoveryArchive(content: string) {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error('Backup ist kein gültiges JSON.');
  }
  const valid = validatePfbackupArchive(raw);
  if (!valid.archiveValid || !valid.summary)
    throw new Error(valid.errors.join(' ') || 'Backup ist offline nicht nutzbar.');
  if (
    typeof valid.summary.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(valid.summary.createdAt))
  )
    throw new Error('Backup-Zeitstempel ist ungültig.');
  const archive = parsePfbackupArchive(raw);
  const settings = JSON.parse(archive.settingsJson) as { env?: Record<string, string> };
  const env = settings.env ?? {};
  if (
    !env ||
    typeof env !== 'object' ||
    Array.isArray(env) ||
    Object.values(env).some((value) => typeof value !== 'string')
  )
    throw new Error('Backup-Konfiguration ist ungültig.');
  const tls = buildPfbackupTlsInspectSummary(env, archive.tlsArchiveBase64);
  if (
    tls &&
    (!tls.metadataConsistent || (tls.inBackup && (!tls.payloadPresent || !tls.payloadMatches)))
  )
    throw new Error('HTTPS-Daten fehlen oder passen nicht zur Sicherung.');
  if (archive.tlsArchiveBase64 && (!tls || !tls.payloadMatches))
    throw new Error('HTTPS-Identität passt nicht zur Sicherung.');
  return { createdAt: valid.summary.createdAt, containsTls: tls?.inBackup ?? false };
}

function names(home: string): string[] {
  const root = backupDirectory(home);
  if (
    !fs.existsSync(root) ||
    !fs.lstatSync(root).isDirectory() ||
    fs.lstatSync(root).isSymbolicLink()
  )
    return [];
  return fs
    .readdirSync(root)
    .filter(
      (name) =>
        /^praxis-flow-backup-.+\.pfbackup$/.test(name) &&
        fs.lstatSync(path.join(root, name)).isFile(),
    );
}

function readCandidate(home: string, id: string): { fileName: string; bytes: Buffer } {
  const fileName = names(home).find((name) => candidateId(name) === id);
  if (!fileName) throw new Error('Backup-Auswahl nicht mehr verfügbar.');
  const bytes = fs.readFileSync(path.join(backupDirectory(home), fileName));
  inspectRecoveryArchive(bytes.toString('utf8'));
  return { fileName, bytes };
}

export function discoverRecoveryBackups(home: string): RecoveryBackupCandidate[] {
  return names(home)
    .flatMap((fileName) => {
      try {
        const content = fs.readFileSync(path.join(backupDirectory(home), fileName), 'utf8');
        return [
          {
            id: candidateId(fileName),
            ...inspectRecoveryArchive(content),
            archiveUsable: true as const,
          },
        ];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function pinRecoveryBackup(
  home: string,
  operationId: string,
  id: string,
): NonNullable<InstallOperation['backup']> {
  const { fileName, bytes } = readCandidate(home, id);
  const target = path.join(installOperationDirectory(home, operationId), 'backup.pfbackup');
  fs.writeFileSync(target, bytes);
  const pinned = fs.readFileSync(target);
  const summary = inspectRecoveryArchive(pinned.toString('utf8'));
  return { fileName, sha256: digest(pinned), containsTls: summary.containsTls };
}

export function readPinnedRecoveryBackup(home: string, operation: InstallOperation): string {
  if (!operation.backup) throw new Error('Kein Backup ausgewählt.');
  const target = path.join(installOperationDirectory(home, operation.id), 'backup.pfbackup');
  if (!fs.existsSync(target) || !fs.lstatSync(target).isFile())
    throw new Error(
      'Die vorbereitete Sicherung fehlt oder ist keine gültige Datei. Wiederherstellung abgebrochen.',
    );
  const bytes = fs.readFileSync(target);
  const content = bytes.toString('utf8');
  if (digest(bytes) !== operation.backup.sha256)
    throw new Error('Die vorbereitete Sicherung wurde verändert. Wiederherstellung abgebrochen.');
  inspectRecoveryArchive(content);
  return content;
}
