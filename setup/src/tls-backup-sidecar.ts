import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listTarArchiveEntriesVerbose, type TarArchiveEntry } from './pfupdate-package.js';
import { resolveProxyTlsPaths } from './proxy-tls.js';

export type TlsSidecarManifest = {
  formatVersion: 1 | 2;
  installationId: string;
  /** Compatibility identity; equals staffHostname in format v2. */
  hostname: string;
  installationDomain?: string;
  staffHostname?: string;
  portalHostname?: string;
  wildcardCertificateName?: string;
};

const MANIFEST_NAME = 'manifest.json';
const ALLOWED_TOP_LEVEL = new Set([
  'manifest.json',
  'caddy-data',
  'caddy-config',
  'acme-dns.json',
  'certs',
]);

export function decodeTlsSidecarBase64(tlsSidecarBase64: string | undefined): Buffer | null {
  if (typeof tlsSidecarBase64 !== 'string' || tlsSidecarBase64.trim() === '') {
    return null;
  }
  try {
    const buffer = Buffer.from(tlsSidecarBase64, 'base64');
    return buffer.length > 0 ? buffer : null;
  } catch {
    return null;
  }
}

function isSafeRelativePath(value: string): boolean {
  if (!value || value.startsWith('/') || value.includes('..')) {
    return false;
  }
  if (/^[a-zA-Z]:/.test(value) || value.includes('\\')) {
    return false;
  }
  const top = value.split('/')[0] ?? '';
  return ALLOWED_TOP_LEVEL.has(top);
}

function validateSidecarTarEntries(entries: TarArchiveEntry[]): void {
  let hasManifest = false;
  for (const entry of entries) {
    if (!entry.name) {
      continue;
    }
    if (entry.type !== 'file' && entry.type !== 'directory') {
      throw new Error(`TLS-Sidecar enthält einen unzulässigen Eintrag: ${entry.rawName}`);
    }
    if (!isSafeRelativePath(entry.name)) {
      throw new Error(`TLS-Sidecar enthält einen unsicheren Pfad: ${entry.rawName}`);
    }
    if (entry.name === MANIFEST_NAME && entry.type === 'file') {
      hasManifest = true;
    }
  }
  if (!hasManifest) {
    throw new Error('TLS-Sidecar enthält kein manifest.json.');
  }
}

function writeTempSidecarArchive(bytes: Buffer): string {
  const tempPath = path.join(
    os.tmpdir(),
    `praxis-flow-tls-sidecar-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tgz`,
  );
  fs.writeFileSync(tempPath, bytes);
  return tempPath;
}

export function parseTlsSidecarManifestFromBytes(bytes: Buffer): TlsSidecarManifest | null {
  const archivePath = writeTempSidecarArchive(bytes);
  try {
    const entries = listTarArchiveEntriesVerbose(archivePath);
    validateSidecarTarEntries(entries);
    const listed = spawnSync('tar', ['-xOf', archivePath, MANIFEST_NAME], { encoding: 'utf8' });
    if (listed.status !== 0) {
      return null;
    }
    const parsed = JSON.parse(listed.stdout) as Partial<TlsSidecarManifest>;
    if (parsed.formatVersion !== 1 && parsed.formatVersion !== 2) {
      return null;
    }
    const installationId =
      typeof parsed.installationId === 'string' ? parsed.installationId.trim() : '';
    const hostname = typeof parsed.hostname === 'string' ? parsed.hostname.trim() : '';
    const optionalName = (key: keyof TlsSidecarManifest): string | undefined => {
      const value = parsed[key];
      return typeof value === 'string' && value.trim() ? value.trim() : undefined;
    };
    return {
      formatVersion: parsed.formatVersion,
      installationId,
      hostname,
      ...(optionalName('installationDomain')
        ? { installationDomain: optionalName('installationDomain') }
        : {}),
      ...(optionalName('staffHostname') ? { staffHostname: optionalName('staffHostname') } : {}),
      ...(optionalName('portalHostname') ? { portalHostname: optionalName('portalHostname') } : {}),
      ...(optionalName('wildcardCertificateName')
        ? { wildcardCertificateName: optionalName('wildcardCertificateName') }
        : {}),
    };
  } catch {
    return null;
  } finally {
    if (fs.existsSync(archivePath)) {
      fs.unlinkSync(archivePath);
    }
  }
}

function copyIfExists(source: string, destination: string): void {
  if (!fs.existsSync(source)) {
    return;
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
}

export function restrictSecretPath(target: string): void {
  if (!fs.existsSync(target)) {
    return;
  }
  if (process.platform === 'win32') {
    const user = process.env.USERNAME?.trim();
    if (!user) {
      return;
    }
    spawnSync('icacls', [target, '/inheritance:r', '/grant:r', `${user}:(OI)(CI)F`], {
      encoding: 'utf8',
      windowsHide: true,
    });
    return;
  }
  const stat = fs.lstatSync(target);
  fs.chmodSync(target, stat.isDirectory() ? 0o700 : 0o600);
}

export function packTlsSidecarArchive(input: {
  installHome: string;
  installationId: string;
  hostname: string;
  installationDomain?: string;
  staffHostname?: string;
  portalHostname?: string;
  wildcardCertificateName?: string;
  destinationPath: string;
}): void {
  const paths = resolveProxyTlsPaths(input.installHome);
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-tls-sidecar-pack-'));
  try {
    const manifest: TlsSidecarManifest = {
      formatVersion: 2,
      installationId: input.installationId,
      hostname: input.staffHostname || input.hostname,
      ...(input.installationDomain ? { installationDomain: input.installationDomain } : {}),
      ...(input.staffHostname ? { staffHostname: input.staffHostname } : {}),
      ...(input.portalHostname ? { portalHostname: input.portalHostname } : {}),
      ...(input.wildcardCertificateName
        ? { wildcardCertificateName: input.wildcardCertificateName }
        : {}),
    };
    fs.writeFileSync(path.join(staging, MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`);
    copyIfExists(paths.caddyData, path.join(staging, 'caddy-data'));
    copyIfExists(paths.caddyConfig, path.join(staging, 'caddy-config'));
    copyIfExists(paths.acmeDnsCredentials, path.join(staging, 'acme-dns.json'));
    copyIfExists(paths.certs, path.join(staging, 'certs'));
    fs.mkdirSync(path.dirname(input.destinationPath), { recursive: true });
    const packed = spawnSync('tar', ['czf', input.destinationPath, '-C', staging, '.'], {
      encoding: 'utf8',
    });
    if (packed.status !== 0) {
      throw new Error(
        packed.stderr || packed.stdout || 'TLS-Sidecar konnte nicht geschrieben werden.',
      );
    }
    restrictSecretPath(input.destinationPath);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

function restoreCopiedTree(source: string, destination: string): void {
  if (!fs.existsSync(source)) {
    return;
  }
  fs.mkdirSync(destination, { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
  restrictSecretPath(destination);
}

function rmIfExists(target: string): void {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

/** Wipe Caddy runtime trees before unpack so previous ACME/PEMs cannot mix in. */
export function wipeTlsSidecarRestoreTargets(installHome: string): void {
  const paths = resolveProxyTlsPaths(installHome);
  for (const directory of [paths.caddyData, paths.caddyConfig, paths.certs]) {
    rmIfExists(directory);
    fs.mkdirSync(directory, { recursive: true });
  }
  rmIfExists(paths.acmeDnsCredentials);
}

/** Prepare-only discard / HTTP restore: drop staged TLS material on disk. */
export function wipeTlsStateRoot(installHome: string): void {
  rmIfExists(resolveProxyTlsPaths(installHome).root);
}

export function unpackTlsSidecarBytes(bytes: Buffer, installHome: string): void {
  const archivePath = writeTempSidecarArchive(bytes);
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-tls-sidecar-unpack-'));
  try {
    const entries = listTarArchiveEntriesVerbose(archivePath);
    validateSidecarTarEntries(entries);
    const extracted = spawnSync('tar', ['xzf', archivePath, '-C', staging], { encoding: 'utf8' });
    if (extracted.status !== 0) {
      throw new Error(
        extracted.stderr || extracted.stdout || 'TLS-Sidecar konnte nicht entpackt werden.',
      );
    }
    wipeTlsSidecarRestoreTargets(installHome);
    const paths = resolveProxyTlsPaths(installHome);
    fs.mkdirSync(paths.root, { recursive: true });
    fs.mkdirSync(paths.caddyData, { recursive: true });
    fs.mkdirSync(paths.caddyConfig, { recursive: true });
    fs.mkdirSync(paths.certs, { recursive: true });
    restoreCopiedTree(path.join(staging, 'caddy-data'), paths.caddyData);
    restoreCopiedTree(path.join(staging, 'caddy-config'), paths.caddyConfig);
    const creds = path.join(staging, 'acme-dns.json');
    if (fs.existsSync(creds) && fs.lstatSync(creds).isFile()) {
      fs.copyFileSync(creds, paths.acmeDnsCredentials);
      restrictSecretPath(paths.acmeDnsCredentials);
    }
    restoreCopiedTree(path.join(staging, 'certs'), paths.certs);
    for (const pem of [paths.customFullchain, paths.customPrivateKey]) {
      restrictSecretPath(pem);
    }
  } finally {
    if (fs.existsSync(archivePath)) {
      fs.unlinkSync(archivePath);
    }
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

export function inspectTlsSidecarIdentity(tlsSidecarBase64: string | undefined): {
  present: boolean;
  installationId: string;
  hostname: string;
  installationDomain?: string;
  staffHostname?: string;
  portalHostname?: string;
  wildcardCertificateName?: string;
} {
  const bytes = decodeTlsSidecarBase64(tlsSidecarBase64);
  if (!bytes) {
    return { present: false, installationId: '', hostname: '' };
  }
  const manifest = parseTlsSidecarManifestFromBytes(bytes);
  if (!manifest) {
    return { present: false, installationId: '', hostname: '' };
  }
  return {
    present: true,
    installationId: manifest.installationId,
    hostname: manifest.hostname,
    ...(manifest.installationDomain ? { installationDomain: manifest.installationDomain } : {}),
    ...(manifest.staffHostname ? { staffHostname: manifest.staffHostname } : {}),
    ...(manifest.portalHostname ? { portalHostname: manifest.portalHostname } : {}),
    ...(manifest.wildcardCertificateName
      ? { wildcardCertificateName: manifest.wildcardCertificateName }
      : {}),
  };
}
