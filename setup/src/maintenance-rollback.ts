import fs from 'node:fs';
import path from 'node:path';
import type { ComposeStatus } from '@praxis-flow/server-shared';
import type { AppDataVolumeAccess } from './app-data-volume.js';
import type { ComposeRunOptions } from './docker.js';
import { readEnvMap } from './env-file.js';
import { MANAGER_STATE_FILE, managerStatePath } from './manager-state.js';
import { runConnectionProbes } from './probes.js';
import { resolveDeliveryImageConfig } from './delivery-images.js';
import type { SetupContext } from './setup-context.js';
import { resolveProxyTlsPaths } from './proxy-tls.js';
import { resolveCanonicalBaseUrl } from './urls.js';
import {
  waitForExpectedStackHealth,
  type WaitForStackHealthOptions,
} from './stack-health.js';

const TLS_STATE_ROLLBACK_DIR = 'tls-state';

export type MaintenanceStackRuntime = {
  stopStack: (runOptions: ComposeRunOptions) => Promise<{ ok: boolean; log: string }>;
  startFullStack: (
    runOptions: ComposeRunOptions,
  ) => Promise<{ ok: boolean; log: string; gatewaySkipped: boolean }>;
  composeStatus: (runOptions: ComposeRunOptions) => Promise<ComposeStatus>;
  stackHealthWaitOptions?: WaitForStackHealthOptions;
  runHealthChecks: (input: {
    localAppBaseUrl: string;
    lanAppBaseUrl: string | null;
  }) => Promise<{ ok: boolean; errors: string[] }>;
};

export type MaintenanceRollbackArtifacts = {
  rollbackDir: string;
  managerStatePath: string;
  appDataDir: string;
};

export function readHostEnvRecord(envPath: string): Record<string, string> {
  return fs.existsSync(envPath) ? Object.fromEntries(readEnvMap(envPath).entries()) : {};
}

export function resolveMaintenanceComposeRunOptions(
  ctx: SetupContext,
  envMap: Map<string, string>,
): ComposeRunOptions {
  const delivery = resolveDeliveryImageConfig({ projectRoot: ctx.home, envMap });
  return {
    projectRoot: ctx.home,
    delivery: Boolean(delivery?.appImage),
    composeProjectName: ctx.composeProjectName,
  };
}

export async function runDefaultMaintenanceHealthChecks(input: {
  localAppBaseUrl: string;
  lanAppBaseUrl: string | null;
}): Promise<{ ok: boolean; errors: string[] }> {
  const probes = await runConnectionProbes({
    localAppBaseUrl: input.localAppBaseUrl,
    lanAppBaseUrl: input.lanAppBaseUrl ?? undefined,
  });
  const errors = probes.filter((probe) => !probe.ok).map((probe) => probe.message);
  return { ok: errors.length === 0, errors };
}

export async function captureMaintenanceRollback(
  ctx: SetupContext,
  rollbackDir: string,
  appDataAccess: AppDataVolumeAccess,
): Promise<MaintenanceRollbackArtifacts> {
  const envPath = path.join(ctx.home, '.env');
  const managerPath = managerStatePath(ctx.home);
  const appDataDir = path.join(rollbackDir, 'app-data');
  fs.mkdirSync(rollbackDir, { recursive: true });
  if (fs.existsSync(envPath)) {
    fs.copyFileSync(envPath, path.join(rollbackDir, '.env'));
  }
  if (fs.existsSync(managerPath)) {
    fs.copyFileSync(managerPath, path.join(rollbackDir, MANAGER_STATE_FILE));
  }
  const tlsRoot = resolveProxyTlsPaths(ctx.home).root;
  if (fs.existsSync(tlsRoot)) {
    fs.cpSync(tlsRoot, path.join(rollbackDir, TLS_STATE_ROLLBACK_DIR), { recursive: true });
  }
  await appDataAccess.backupDbFiles(appDataDir);
  return { rollbackDir, managerStatePath: managerPath, appDataDir };
}

async function recordFailure(
  errors: string[],
  fallback: string,
  action: () => Promise<unknown>,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    errors.push(error instanceof Error ? error.message : fallback);
  }
}

async function restoreMaintenanceFiles(
  input: Parameters<typeof executeMaintenanceRollback>[0],
  errors: string[],
): Promise<Map<string, string>> {
  input.beforeRestore?.();
  const rollbackEnv = path.join(input.rollback.rollbackDir, '.env');
  if (fs.existsSync(rollbackEnv)) {
    fs.copyFileSync(rollbackEnv, path.join(input.ctx.home, '.env'));
  } else {
    errors.push('Rollback-.env fehlt.');
  }

  const rollbackManager = path.join(input.rollback.rollbackDir, MANAGER_STATE_FILE);
  if (fs.existsSync(rollbackManager)) {
    fs.copyFileSync(rollbackManager, input.rollback.managerStatePath);
  } else if (fs.existsSync(input.rollback.managerStatePath)) {
    fs.unlinkSync(input.rollback.managerStatePath);
  }

  await recordFailure(errors, 'Neue Runtime-DB nicht verschoben.', () =>
    input.appDataAccess.moveDbAside(path.join(input.rollback.rollbackDir, input.failedDbDirName)),
  );
  await recordFailure(errors, 'Rollback-DB nicht zurückgespielt.', () =>
    input.appDataAccess.restoreDbFiles(input.rollback.appDataDir),
  );

  const tlsRoot = resolveProxyTlsPaths(input.ctx.home).root;
  const tlsRollback = path.join(input.rollback.rollbackDir, TLS_STATE_ROLLBACK_DIR);
  await recordFailure(errors, 'HTTPS-State (tls) nicht zurückgespielt.', async () => {
    if (fs.existsSync(tlsRoot)) {
      fs.rmSync(tlsRoot, { recursive: true, force: true });
    }
    if (fs.existsSync(tlsRollback)) {
      fs.cpSync(tlsRollback, tlsRoot, { recursive: true });
    }
  });

  return readEnvMap(path.join(input.ctx.home, '.env'));
}

async function verifyMaintenanceRollback(
  input: Parameters<typeof executeMaintenanceRollback>[0],
  envMap: Map<string, string>,
  errors: string[],
): Promise<void> {
  const runOptions = resolveMaintenanceComposeRunOptions(input.ctx, envMap);
  const up = await input.runtime.startFullStack(runOptions);
  if (!up.ok) {
    errors.push(up.log || 'Stack konnte nach Rollback nicht gestartet werden.');
  }
  const stackHealth = await waitForExpectedStackHealth(
    input.runtime.composeStatus,
    runOptions,
    input.runtime.stackHealthWaitOptions,
  );
  if (!stackHealth.ok) {
    errors.push(...stackHealth.errors);
    return;
  }
  const health = await input.runtime.runHealthChecks({
    localAppBaseUrl: input.localAppBaseUrl,
    lanAppBaseUrl: resolveCanonicalBaseUrl(envMap, envMap.get('SETUP_LAN_APP_IP')),
  });
  if (!health.ok) {
    errors.push(...health.errors);
  }
}

export async function executeMaintenanceRollback(input: {
  ctx: SetupContext;
  rollback: MaintenanceRollbackArtifacts;
  appDataAccess: AppDataVolumeAccess;
  runtime: MaintenanceStackRuntime;
  localAppBaseUrl: string;
  failedDbDirName: string;
  beforeRestore?: () => void;
}): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = [];
  try {
    const currentEnv = readEnvMap(path.join(input.ctx.home, '.env'));
    const stop = await input.runtime.stopStack(
      resolveMaintenanceComposeRunOptions(input.ctx, currentEnv),
    );
    if (!stop.ok) {
      return { ok: false, errors: [stop.log || 'Stack konnte nicht gestoppt werden.'] };
    }

    const envAfter = await restoreMaintenanceFiles(input, errors);
    await verifyMaintenanceRollback(input, envAfter, errors);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Rollback ist unerwartet fehlgeschlagen.');
  }
  return { ok: errors.length === 0, errors };
}
