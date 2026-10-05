import fs from 'node:fs';
import path from 'node:path';
import { ManagerApiError } from '@praxis-flow/server-shared/setup-api';
import { composePs, composeRemoveServices, composeStop, type ComposeRunOptions } from './docker.js';
import { readEnvMap } from './env-file.js';
import { readInstalledPortalContract } from './proxy-tls.js';
import { auditRuntimePostcondition, createRuntimePostcondition } from './runtime-postcondition.js';
import { waitForExpectedStackHealth, type WaitForStackHealthOptions } from './stack-health.js';
import { restrictedDiagnostic } from './restricted-diagnostics.js';

export type RestrictedStartAuditHooks = {
  composePs?: typeof composePs;
  composeRemoveServices?: typeof composeRemoveServices;
  composeStop?: typeof composeStop;
  auditListeners?: NonNullable<Parameters<typeof auditRuntimePostcondition>[2]>['auditListeners'];
  auditStaffBindings?: NonNullable<
    Parameters<typeof auditRuntimePostcondition>[2]
  >['auditBindings'];
  stackHealthWaitOptions?: WaitForStackHealthOptions;
};

/** A successful managed start must prove policy, not merely published ports. */
export async function auditRestrictedStart(
  options: ComposeRunOptions,
  hooks: RestrictedStartAuditHooks = {},
): Promise<void> {
  const envPath = path.join(options.projectRoot, '.env');
  if (!fs.existsSync(envPath)) return;
  const env = readEnvMap(envPath);
  if (env.get('SETUP_RESTRICTED_ENABLED')?.trim().toLowerCase() !== 'true') return;
  try {
    const health = await waitForExpectedStackHealth(
      hooks.composePs ?? composePs,
      options,
      hooks.stackHealthWaitOptions,
    );
    restrictedDiagnostic('start.health', { ok: health.ok, errors: health.errors });
    if (!health.ok) throw new Error(health.errors.join('; '));
    const audit = await auditRuntimePostcondition(
      createRuntimePostcondition(env, readInstalledPortalContract(options.projectRoot)),
      health.compose,
      { auditListeners: hooks.auditListeners, auditBindings: hooks.auditStaffBindings },
    );
    if (!audit.ok) throw new Error(audit.errors.join('; '));
  } catch (cause) {
    // Removal also prevents Docker's restart policy from reopening an unaudited proxy.
    let removed = false;
    let stopped = false;
    try {
      removed = (await (hooks.composeRemoveServices ?? composeRemoveServices)(options, ['proxy']))
        .ok;
    } catch {
      /* Try stopping if removal failed. */
    }
    if (!removed) {
      try {
        stopped = (await (hooks.composeStop ?? composeStop)({ ...options, services: ['proxy'] }))
          .ok;
      } catch {
        /* Report that closure could not be established. */
      }
    }
    restrictedDiagnostic('start.closed', { removed, stopped });
    throw new ManagerApiError(
      {
        code: removed ? 'restricted_start_audit_failed' : 'restricted_start_closure_incomplete',
        category: 'inconsistent',
        retryable: false,
        message: removed
          ? 'Patientenzugang hat die Startprüfung nicht bestanden. Der Proxy wurde vorsorglich entfernt. Bitte die Diagnose prüfen.'
          : 'Patientenzugang hat die Startprüfung nicht bestanden; der Proxy konnte nicht sicher entfernt werden. Docker-Zustand und Diagnose prüfen.',
      },
      { cause },
    );
  }
}
