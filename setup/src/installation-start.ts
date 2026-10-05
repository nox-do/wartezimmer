import { withRestrictedDiagnostics } from './restricted-diagnostics.js';
import { auditRestrictedStart, type RestrictedStartAuditHooks } from './restricted-start-audit.js';
import { ManagerApiError } from '@praxis-flow/server-shared/setup-api';
import { createModuleLogger } from './logger.js';
import type { InstallationStartFailure } from './installation-state.js';
import type { ComposeStatus } from '@praxis-flow/server-shared';
import { composePs, composeUp, type ComposeRunOptions } from './docker.js';
import { runDockerCommand } from './docker-cli.js';
import { coreInstallationServicesHealthy } from './installation-state.js';
import {
  inspectMaintenanceCompatibility,
  maintenanceFailureCodes,
  type MaintenanceCompatibility,
} from './settings-format-version.js';
import { APP_DB_PATH, appDataVolumeName } from './staff-pin-reset.js';

const logger = createModuleLogger('setup.installation-start');

export type InstallationStartDependencies = RestrictedStartAuditHooks & {
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
): Promise<{ ok: true } | { ok: false; code: InstallationStartFailure }> {
  if (!appImage) {
    throw new ManagerApiError({
      code: 'app_image_unconfigured',
      category: 'inconsistent',
      message: 'Das App-Image ist nicht konfiguriert. Bitte die Installation prüfen.',
      retryable: false,
    });
  }
  const checkedDocker: typeof runDockerCommand = async (args, options) => {
    try {
      const result = await runDocker(args, options);
      if (result.code !== 0 && !(args[0] === 'run' && result.code === 42)) {
        throw new Error('Docker-Prüfung fehlgeschlagen', { cause: result });
      }
      return result;
    } catch (cause) {
      if (cause instanceof ManagerApiError) throw cause;
      throw new ManagerApiError(
        {
          code: 'installation_inspection_failed',
          category: 'unavailable',
          message: 'Die Installationsdaten konnten nicht geprüft werden. Bitte erneut versuchen.',
          retryable: true,
        },
        { cause },
      );
    }
  };
  // Only successful inventory queries prove absence; inspect failures do not.
  const images = await checkedDocker(['image', 'ls', '--quiet', appImage]);
  if (!images.stdout.trim()) return { ok: false, code: 'app-image-missing' };
  const volume = appDataVolumeName(composeProjectName);
  const volumes = await checkedDocker(['volume', 'ls', '--format', '{{.Name}}']);
  if (!volumes.stdout.split('\n').includes(volume)) {
    return { ok: false, code: 'data-volume-missing' };
  }

  const database = await checkedDocker([
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
    `test -r /var/lib/praxis-flow/app && test -x /var/lib/praxis-flow/app || exit 43; if test -f ${APP_DB_PATH}; then exit 0; elif test ! -e ${APP_DB_PATH}; then exit 42; else exit 43; fi`,
  ]);
  if (database.code === 42) return { ok: false, code: 'database-missing' };
  return { ok: true };
}

export async function startExistingInstallation(
  runOptions: ComposeRunOptions,
  appImage: string,
  deps: InstallationStartDependencies = {},
) {
  return withRestrictedDiagnostics(runOptions.projectRoot, 'start-existing', () =>
    startExistingInstallationInternal(runOptions, appImage, deps),
  );
}

async function startExistingInstallationInternal(
  runOptions: ComposeRunOptions,
  appImage: string,
  deps: InstallationStartDependencies = {},
): Promise<
  {
    compose: ComposeStatus | null;
    maintenanceStatus: MaintenanceCompatibility['status'];
  } & ({ ok: true } | { ok: false; code: InstallationStartFailure })
> {
  const gate = await inspectExistingAppDatabase(
    runOptions.composeProjectName,
    appImage,
    deps.runDocker,
  );
  if (!gate.ok) {
    return {
      ok: false,
      code: gate.code,
      compose: null,
      maintenanceStatus: 'unreachable',
    };
  }

  const up = await (deps.composeUp ?? composeUp)({ ...runOptions, build: false });
  if (!up.ok) {
    logger.error({ composeLog: up.log }, 'Start der vorhandenen Installation fehlgeschlagen');
    return {
      ok: false,
      code: 'compose-start-failed',
      compose: null,
      maintenanceStatus: 'unreachable',
    };
  }

  await auditRestrictedStart(runOptions, {
    ...deps,
    stackHealthWaitOptions: deps.stackHealthWaitOptions ?? deps,
  });

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
      code: 'health-timeout',
      compose,
      maintenanceStatus: 'unreachable',
    };
  }

  const maintenance = await (deps.inspectMaintenance ?? inspectMaintenanceCompatibility)();
  return {
    ...(maintenance.status === 'compatible'
      ? { ok: true as const }
      : {
          ok: false as const,
          code: maintenanceFailureCodes[maintenance.status],
        }),
    compose,
    maintenanceStatus: maintenance.status,
  };
}
