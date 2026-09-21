import fs from 'node:fs';
import path from 'node:path';
import { composeDown } from './docker.js';
import { runDockerCommand } from './docker-cli.js';
import type { SetupContext } from './setup-context.js';

const PRODUCT_VOLUME_KEYS = ['app_data', 'sandbox_intake_data', 'clamav_db'] as const;

const MANAGED_ARTIFACTS = [
  '.env',
  'manager-state.json',
  'docker-compose.delivery.yml',
  'docker-compose.proxy.delivery.yml',
  'docker-compose.proxy-tls.delivery.yml',
  'docker-compose.proxy-restricted.delivery.yml',
  'docker-compose.yml',
  'docker-compose.proxy.yml',
  'docker-compose.proxy-tls.yml',
  'docker-compose.proxy-restricted.yml',
  'proxy/Caddyfile',
  'state/tls',
  'state/restricted-operation',
  'state/restricted-recovery.json',
] as const;

export type FactoryResetDeps = {
  composeDown?: typeof composeDown;
  inspectVolume?: (name: string) => Promise<{ exists: boolean; project: string | null }>;
  removeVolume?: (name: string) => Promise<void>;
};

async function inspectVolume(name: string): Promise<{ exists: boolean; project: string | null }> {
  const result = await runDockerCommand([
    'volume',
    'inspect',
    name,
    '--format',
    '{{json .Labels}}',
  ]);
  if (result.code !== 0) return { exists: false, project: null };
  const labels = JSON.parse(result.stdout || '{}') as Record<string, string> | null;
  return { exists: true, project: labels?.['com.docker.compose.project'] ?? null };
}

async function removeVolume(name: string): Promise<void> {
  const result = await runDockerCommand(['volume', 'rm', name]);
  if (result.code !== 0) throw new Error(`INSTALL_VOLUME_REMOVE_FAILED: ${name}`);
}

export function resetManagedInstallArtifacts(home: string): string[] {
  const removed: string[] = [];
  for (const relativePath of MANAGED_ARTIFACTS) {
    const target = path.join(home, relativePath);
    if (!fs.existsSync(target)) continue;
    fs.rmSync(target, { recursive: true, force: true });
    removed.push(relativePath);
  }
  return removed;
}

export async function factoryResetInstallation(
  ctx: SetupContext,
  composeRoot: string,
  deps: FactoryResetDeps = {},
): Promise<{ removedArtifacts: string[] }> {
  const down = deps.composeDown ?? composeDown;
  const inspect = deps.inspectVolume ?? inspectVolume;
  const remove = deps.removeVolume ?? removeVolume;
  const result = await down({
    projectRoot: composeRoot,
    composeProjectName: ctx.composeProjectName,
    delivery: true,
    withProxy: false,
    volumes: true,
    removeOrphans: true,
  });
  if (!result.ok) throw new Error(`INSTALL_COMPOSE_TEARDOWN_FAILED: ${result.log}`);

  for (const key of PRODUCT_VOLUME_KEYS) {
    const name = `${ctx.composeProjectName}_${key}`;
    const volume = await inspect(name);
    if (!volume.exists) continue;
    if (volume.project !== ctx.composeProjectName) {
      throw new Error(`INSTALL_VOLUME_OWNERSHIP_CONFLICT: ${name}`);
    }
    await remove(name);
  }
  return { removedArtifacts: resetManagedInstallArtifacts(ctx.home) };
}
