import fs from 'node:fs';
import path from 'node:path';
import {
  PORTAL_PROXY_CONTRACT_FILE,
  parsePortalProxyContract,
  type PfupdateManifestV1,
  type PortalProxyContract,
} from '@praxis-flow/server-shared';
import { durableWrite } from './restricted-operation.js';
import { readTlsStatus } from './host-tls.js';
import { resolveProxyTlsPaths, writeGeneratedTlsCaddyfile } from './proxy-tls.js';
import { composeExec, type ComposeRunOptions } from './docker.js';

export function releasePortalContract(
  staging: string,
  manifest: PfupdateManifestV1,
  env: Map<string, string>,
): PortalProxyContract | null {
  const listed = manifest.files.some((entry) => entry.path === PORTAL_PROXY_CONTRACT_FILE);
  if (!listed) {
    if (readTlsStatus(env).mode || env.get('SETUP_RESTRICTED_ENABLED') === 'true')
      throw new Error(
        'Update enthält keinen versionierten Portalvertrag; für HTTPS/Restricted ist ein neues Updatepaket erforderlich.',
      );
    return null;
  }
  return parsePortalProxyContract(
    JSON.parse(fs.readFileSync(path.join(staging, PORTAL_PROXY_CONTRACT_FILE), 'utf8')),
  );
}

export async function installReleaseProxyContract(
  home: string,
  contract: PortalProxyContract | null,
  env: Map<string, string>,
  options: ComposeRunOptions,
  validate: typeof composeExec = composeExec,
): Promise<void> {
  if (!contract) return;
  durableWrite(
    path.join(resolveProxyTlsPaths(home).root, 'portal-contract.json'),
    JSON.stringify(contract),
  );
  const tls = readTlsStatus(env);
  if (!tls.mode) return;
  const file = resolveProxyTlsPaths(home).caddyfile;
  if (
    fs.existsSync(file) &&
    !/^# PRAXIS-FLOW-GENERATED LAN-TLS v\d+/m.test(fs.readFileSync(file, 'utf8'))
  )
    throw new Error('Operator-eigene Caddy-Konfiguration wird beim Update nicht überschrieben.');
  writeGeneratedTlsCaddyfile(home, tls, env);
  const result = await validate({
    ...options,
    withProxy: true,
    oneOff: true,
    service: 'proxy',
    args: ['caddy', 'validate', '--config', '/etc/caddy/Caddyfile'],
  });
  if (!result.ok) throw new Error(`Release-Proxyvertrag ungültig: ${result.log}`);
}
