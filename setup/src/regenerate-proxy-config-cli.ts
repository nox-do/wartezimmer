import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readEnvMap } from './env-file.js';
import { readTlsStatus } from './host-tls.js';
import { resolveInstallHome } from './install-home.js';
import {
  generateTlsCaddyfile,
  readInstalledPortalContract,
  GENERATED_CADDYFILE_MARKER,
  resolveProxyTlsPaths,
  writeGeneratedTlsCaddyfile,
} from './proxy-tls.js';

const GENERATED_MARKER_PATTERN = /^# PRAXIS-FLOW-GENERATED LAN-TLS v\d+\s*$/m;

export type RegenerateProxyConfigResult = {
  caddyfilePath: string;
  backupPath: string | null;
};

function timestampForPath(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-');
}

export function regenerateProxyConfig(
  installHome: string,
  now: Date = new Date(),
): RegenerateProxyConfigResult {
  const envPath = path.join(installHome, '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error(`Keine bestehende Installation unter ${installHome} gefunden.`);
  }

  const env = readEnvMap(envPath);
  const tls = readTlsStatus(env);
  if (!tls.cutoverApplied || tls.state !== 'active' || !tls.mode) {
    throw new Error('HTTPS muss aktiv sein, bevor die Proxy-Konfiguration neu erzeugt wird.');
  }
  if (!tls.staffHostname || !tls.portalHostname) {
    throw new Error('Staff- oder Portal-Hostname fehlt in der bestehenden HTTPS-Konfiguration.');
  }

  const generated = generateTlsCaddyfile(tls, env, readInstalledPortalContract(installHome));
  if (
    !generated.startsWith(GENERATED_CADDYFILE_MARKER) ||
    generated.includes(':444 {') !== (env.get('SETUP_RESTRICTED_ENABLED') === 'true')
  ) {
    throw new Error('Der aktuelle Proxy-Vertrag passt nicht zum Restricted-Aktivierungszustand.');
  }

  const caddyfilePath = resolveProxyTlsPaths(installHome).caddyfile;
  const previous = fs.existsSync(caddyfilePath) ? fs.readFileSync(caddyfilePath) : null;
  if (previous && !GENERATED_MARKER_PATTERN.test(previous.toString('utf8'))) {
    throw new Error('Das vorhandene Caddyfile ist nicht als Wartezimmer-generiert markiert.');
  }
  const backupPath = previous ? `${caddyfilePath}.backup-${timestampForPath(now)}` : null;
  if (backupPath && previous) {
    fs.writeFileSync(backupPath, previous, { flag: 'wx' });
  }

  try {
    writeGeneratedTlsCaddyfile(installHome, tls, env);
    const written = fs.readFileSync(caddyfilePath, 'utf8');
    if (written !== generated) {
      throw new Error('Die geschriebene Proxy-Konfiguration konnte nicht verifiziert werden.');
    }
  } catch (error) {
    if (previous) {
      fs.writeFileSync(caddyfilePath, previous);
    } else if (fs.existsSync(caddyfilePath)) {
      fs.unlinkSync(caddyfilePath);
    }
    throw error;
  }

  return { caddyfilePath, backupPath };
}

function parseInstallHome(args: string[]): string {
  if (args.length === 0) return resolveInstallHome();
  if (args.length === 2 && args[0] === '--install-home' && args[1]?.trim()) {
    return path.resolve(args[1]);
  }
  throw new Error('Aufruf: npm run setup:regenerate-proxy-config -- [--install-home <Pfad>]');
}

async function main(): Promise<void> {
  const installHome = parseInstallHome(process.argv.slice(2));
  const result = regenerateProxyConfig(installHome);
  console.log(`Proxy-Konfiguration aktualisiert: ${result.caddyfilePath}`);
  if (result.backupPath) console.log(`Sicherung: ${result.backupPath}`);
  console.log('Zertifikate, ACME-Daten und TLS-Status wurden nicht verändert.');
}

const invokedDirectly = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
