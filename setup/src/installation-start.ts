import type { ComposeStatus } from '@praxis-flow/server-shared';
import { composePs, composeUp, type ComposeRunOptions } from './docker.js';
import { runDockerCommand } from './docker-cli.js';
import { coreInstallationServicesHealthy } from './installation-state.js';
import { inspectMaintenanceCompatibility } from './settings-format-version.js';
import { APP_DB_PATH, appDataVolumeName } from './staff-pin-reset.js';

export type InstallationStartDependencies = {
  runDocker?: typeof runDockerCommand;
  composeUp?: typeof composeUp;
  composePs?: typeof composePs;
  inspectMaintenance?: typeof inspectMaintenanceCompatibility;
  timeoutMs?: number;
  intervalMs?: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
};

export async function inspectExistingAppDatabase(
  composeProjectName: string,
  appImage: string,
  runDocker: typeof runDockerCommand = runDockerCommand,
): Promise<{ ok: boolean; reason?: string }> {
  if (!appImage) return { ok: false, reason: 'Das lokale App-Image ist nicht festgelegt.' };
  const volume = appDataVolumeName(composeProjectName);
  const inspected = await runDocker(['volume', 'inspect', volume]);
  if (inspected.code !== 0) {
    return { ok: false, reason: `App-Datenvolume ${volume} fehlt.` };
  }

  const database = await runDocker([
    'run',
    '--rm',
    '--pull=never',
    '--network',
    'none',
    '--read-only',
    '--entrypoint',
    '/bin/sh',
    '-v',
    `${volume}:/var/lib/praxis-flow/app:ro`,
    appImage,
    '-c',
    `test -f ${APP_DB_PATH}`,
  ]);
  if (database.code !== 0) {
    return { ok: false, reason: `App-Datenbank ${APP_DB_PATH} fehlt im Volume ${volume}.` };
  }
  return { ok: true };
}

export async function startExistingInstallation(
  runOptions: ComposeRunOptions,
  appImage: string,
  deps: InstallationStartDependencies = {},
): Promise<{
  ok: boolean;
  log: string;
  compose: ComposeStatus | null;
  maintenanceAuthenticated: boolean;
}> {
  const gate = await inspectExistingAppDatabase(
    runOptions.composeProjectName,
    appImage,
    deps.runDocker,
  );
  if (!gate.ok) {
    return {
      ok: false,
      log: gate.reason ?? 'App-Datenbank fehlt.',
      compose: null,
      maintenanceAuthenticated: false,
    };
  }

  const up = await (deps.composeUp ?? composeUp)({ ...runOptions, build: false });
  if (!up.ok) {
    return { ok: false, log: up.log, compose: null, maintenanceAuthenticated: false };
  }

  const readCompose = deps.composePs ?? composePs;
  const now = deps.now ?? Date.now;
  const sleep =
    deps.sleep ??
    ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const timeoutMs = deps.timeoutMs ?? 120_000;
  const intervalMs = deps.intervalMs ?? 2_000;
  const deadline = now() + timeoutMs;
  let compose = await readCompose(runOptions);
  while (!coreInstallationServicesHealthy(compose) && now() < deadline) {
    await sleep(Math.min(intervalMs, Math.max(0, deadline - now())));
    compose = await readCompose(runOptions);
  }
  if (!coreInstallationServicesHealthy(compose)) {
    return {
      ok: false,
      log: 'App und Sandbox wurden nicht gemeinsam gesund.',
      compose,
      maintenanceAuthenticated: false,
    };
  }

  const maintenance = await (deps.inspectMaintenance ?? inspectMaintenanceCompatibility)();
  return {
    ok: maintenance.authenticated,
    log: maintenance.authenticated
      ? up.log
      : 'Maintenance-API lehnt den Token der Installation ab.',
    compose,
    maintenanceAuthenticated: maintenance.authenticated,
  };
}
