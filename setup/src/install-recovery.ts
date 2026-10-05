import { runHostMutation } from './maintenance-operation-guard.js';
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
import {
  inspectMaintenanceCompatibility,
  maintenanceFailureCodes,
  maintenanceFailureMessages,
} from './settings-format-version.js';
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
async function baselineErrors(ctx: SetupContext, deps: RecoveryDeps): Promise<string[]> {
  const status = await (deps.status ?? getHostStatus)(ctx);
  if (!status.docker.daemonRunning)
    return ['Docker ist nicht erreichbar. Bitte Docker Desktop prüfen.'];
  if (!status.docker.composeAvailable) return ['Docker Compose ist nicht verfügbar.'];
  if (!coreInstallationServicesHealthy(status.compose)) {
    return ['app', 'sandbox'].flatMap((name) => {
      const service = status.compose?.services.find(
        (entry) => (entry.service || entry.name) === name,
      );
      const label = name === 'app' ? 'App' : 'Sandbox';
      if (!service?.state.toLowerCase().includes('running')) return [`${label} läuft noch nicht.`];
      if (service.health?.toLowerCase() === 'healthy') return [];
      return [
        service.health?.toLowerCase() === 'unhealthy'
          ? `${label}: Docker meldet eine fehlgeschlagene Bereitschaftsprüfung.`
          : `${label}: Docker hat den Start noch nicht als gesund bestätigt.`,
      ];
    });
  }
  const maintenance = await (deps.maintenance ?? inspectMaintenanceCompatibility)();
  if (maintenance.status !== 'compatible')
    return [maintenanceFailureMessages[maintenanceFailureCodes[maintenance.status]]];
  return [];
}
export async function previewInstallRecovery(
  ctx: SetupContext,
  id: string,
  deps: RecoveryDeps = {},
): Promise<InstallRecoveryPreview> {
  const operation = requireOperation(ctx, id);
  const content = operation.backup ? readPinnedRecoveryBackup(ctx.home, operation) : null;
  const errors =
    operation.phase === 'installing'
      ? await baselineErrors(ctx, deps)
      : ['Installation zuerst bestätigen.'];
  const ready = errors.length === 0;
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
    baselineErrors: errors,
    backup,
    restoreCompatible: backup?.compatibility.restoreSupported === true,
  };
}
export async function finishInstallRecovery(
  ctx: SetupContext,
  input: InstallFinishInput,
  deps: RecoveryDeps = {},
): Promise<InstallFinishResult> {
  return runHostMutation(ctx.home, 'finishInstallRecovery', async () => {
    const operation = requireOperation(ctx, input.operationId);
    if (operation.phase !== 'installing') throw new Error('Installation zuerst bestätigen.');
    if (input.action !== 'restore' && input.action !== 'without-backup')
      throw new Error('Ungültige Abschlussaktion.');
    const errors = await baselineErrors(ctx, deps);
    if (errors.length > 0) return { ok: false, errors };
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
      const restore = await (deps.restore ?? restorePfbackup)(content, ctx, {
        installationOperationId: operation.id,
      });
      if (!restore.ok) return { ok: false, errors: restore.errors, restore };
      const finalErrors = await baselineErrors(ctx, deps);
      if (finalErrors.length > 0) return { ok: false, errors: finalErrors, restore };
      removeInstallOperation(ctx.home, operation.id);
      return { ok: true, errors: [], restore };
    }
    removeInstallOperation(ctx.home, operation.id);
    return { ok: true, errors: [] };
  });
}
