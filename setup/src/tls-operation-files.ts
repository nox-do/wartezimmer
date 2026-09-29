import { readEnvMap } from './env-file.js';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { durableWrite } from './restricted-operation.js';
import { syncMaintenanceArtifacts, syncMaintenanceHostFiles } from './maintenance-files.js';
import { resolveProxyTlsPaths } from './proxy-tls.js';
import { tlsRollbackDirectory, tlsIdentityReference, type TlsOperation } from './tls-operation.js';

/** The proxy is stopped before capture/restore. Sources stay intact for every retry. */
export function captureTlsRollback(home: string, operation: TlsOperation): void {
  const directory = tlsRollbackDirectory(home, operation.id);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  fs.copyFileSync(path.join(home, '.env'), path.join(directory, '.env'));
  fs.chmodSync(path.join(directory, '.env'), 0o600);
  const source = resolveProxyTlsPaths(home).root;
  const target = path.join(directory, 'tls-state');
  if (fs.existsSync(source)) fs.cpSync(source, target, { recursive: true });
  else fs.mkdirSync(target);
  syncMaintenanceArtifacts(directory, home);
  // A private manifest detects incomplete/damaged snapshots before changing live files.
  durableWrite(path.join(directory, 'manifest.json'), JSON.stringify(snapshotHashes(directory)));
  syncMaintenanceArtifacts(directory, home);
}

function snapshotHashes(directory: string): Record<string, string> {
  const hashes: Record<string, string> = {};
  function visit(relative: string): void {
    const file = path.join(directory, relative);
    const stat = fs.lstatSync(file);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(file).sort()) visit(path.join(relative, name));
    } else if (stat.isFile()) {
      hashes[relative] = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    } else throw new Error('TLS_ROLLBACK_ARTIFACT_INVALID');
  }
  visit('.env');
  visit('tls-state');
  return hashes;
}

export function restoreTlsRollback(home: string, operation: TlsOperation): void {
  const directory = tlsRollbackDirectory(home, operation.id);
  const expected = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  if (JSON.stringify(snapshotHashes(directory)) !== JSON.stringify(expected))
    throw new Error('TLS_ROLLBACK_INCOMPLETE');
  if (tlsIdentityReference(readEnvMap(path.join(directory, '.env'))) !== operation.identity)
    throw new Error('TLS_ROLLBACK_IDENTITY_INVALID');
  const target = resolveProxyTlsPaths(home).root;
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(path.join(directory, 'tls-state'), target, { recursive: true });
  durableWrite(path.join(home, '.env'), fs.readFileSync(path.join(directory, '.env'), 'utf8'));
  syncMaintenanceHostFiles(home);
}
