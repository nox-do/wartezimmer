import type {
  InstallFinishInput,
  InstallFinishResult,
  InstallRecoveryPreview,
} from '@praxis-flow/server-shared';
import { currentTlsClaimsHttps } from '@praxis-flow/server-shared';
import path from 'node:path';
import {
  readInstallOperation,
  installOperationSummary,
  removeInstallOperation,
} from './install-operation.js';
import { readPinnedRecoveryBackup } from './recovery-backup.js';
import { inspectPfbackup } from './settings-backup-inspect.js';
import { restorePfbackup } from './settings-backup-restore.js';
import { coreInstallationServicesHealthy } from './installation-state.js';
import { inspectMaintenanceCompatibility } from './settings-format-version.js';
import { getHostStatus } from './host-state.js';
import { readEnvMap } from './env-file.js';
import type { SetupContext } from './setup-context.js';

export type RecoveryDeps = {
  status?: typeof getHostStatus;
  maintenance?: typeof inspectMaintenanceCompatibility;
  inspect?: typeof inspectPfbackup;
  restore?: typeof restorePfbackup;
};
function requireOperation(ctx: SetupContext, id: string) {
  const operation = readInstallOperation(ctx.home);
  if (!operation || operation.id !== id) throw new Error('Installationsvorgang nicht gefunden.');
  return operation;
}
async function baselineReady(ctx: SetupContext, deps: RecoveryDeps): Promise<boolean> {
  const status = await (deps.status ?? getHostStatus)(ctx);
  return (
    status.docker.daemonRunning &&
    status.docker.composeAvailable &&
    coreInstallationServicesHealthy(status.compose) &&
    status.compose?.running === true &&
    (await (deps.maintenance ?? inspectMaintenanceCompatibility)()).authenticated
  );
}
export async function previewInstallRecovery(
  ctx: SetupContext,
  id: string,
  deps: RecoveryDeps = {},
): Promise<InstallRecoveryPreview> {
  const operation = requireOperation(ctx, id);
  const content = operation.backup ? readPinnedRecoveryBackup(ctx.home, operation) : null;
  const ready = operation.phase === 'installing' && (await baselineReady(ctx, deps));
  const backup = content && ready ? await (deps.inspect ?? inspectPfbackup)(content, ctx) : null;
  if (backup) {
    delete backup.environment;
    backup.compatibility.warnings = backup.compatibility.warnings.map((warning) =>
      /(?:PATH|Verzeichnis)/.test(warning)
        ? 'Speicherpfade der Sicherung weichen ab oder fehlen auf diesem Rechner.'
        : warning,
    );
  }
  return {
    operation: installOperationSummary(operation),
    baselineReady: ready,
    backup,
    restoreCompatible: backup?.compatibility.restoreSupported === true,
  };
}
export async function finishInstallRecovery(
  ctx: SetupContext,
  input: InstallFinishInput,
  deps: RecoveryDeps = {},
): Promise<InstallFinishResult> {
  const operation = requireOperation(ctx, input.operationId);
  if (operation.phase !== 'installing') throw new Error('Installation zuerst bestätigen.');
  if (input.action !== 'restore' && input.action !== 'without-backup')
    throw new Error('Ungültige Abschlussaktion.');
  if (!(await baselineReady(ctx, deps)))
    return {
      ok: false,
      errors: [
        'Die frische Installation ist noch nicht gesund. Einrichtung abschließen oder Neuinstallation erneut starten.',
      ],
    };
  if (input.action === 'restore') {
    const content = readPinnedRecoveryBackup(ctx.home, operation);
    // Recovery always starts from HTTP. After a crash following TLS restore,
    // offer completion or a clean restart instead of silently overwriting HTTPS.
    if (currentTlsClaimsHttps(Object.fromEntries(readEnvMap(path.join(ctx.home, '.env')))))
      return {
        ok: false,
        errors: [
          'HTTPS ist bereits aktiv. Installation abschließen oder für eine erneute Übernahme neu installieren.',
        ],
      };
    const preview = await (deps.inspect ?? inspectPfbackup)(content, ctx);
    if (!preview.compatibility.restoreSupported)
      return {
        ok: false,
        errors: preview.errors ?? ['Backup ist mit der Ziel-App nicht kompatibel.'],
      };
    const restore = await (deps.restore ?? restorePfbackup)(content, ctx);
    if (!restore.ok) return { ok: false, errors: restore.errors, restore };
    if (!(await baselineReady(ctx, deps)))
      return { ok: false, errors: ['Abschlussprüfung fehlgeschlagen.'], restore };
    removeInstallOperation(ctx.home, operation.id);
    return { ok: true, errors: [], restore };
  }
  removeInstallOperation(ctx.home, operation.id);
  return { ok: true, errors: [] };
}
