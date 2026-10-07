import { assertNoMaintenanceOperation } from './maintenance-operation-guard.js';
import { hostMutationLock } from './host-mutation-lock.js';
import fs from 'node:fs';
import path from 'node:path';
import {
  evaluateHostLifecycleAction,
  type HostLifecycleAction,
  type HostLifecycleGuard,
} from '@wartezimmer/server-shared';
import { readEnvMap } from './env-file.js';
import { deriveHostLifecycle } from './host-lifecycle.js';
import { readHostLifecycle } from './host-lifecycle-facts.js';
import { SetupApiValidationError } from './setup-api-normalize.js';
import type { SetupContext } from './setup-context.js';

export type HostLifecycleActionCheck = HostLifecycleGuard & {
  lifecycle: ReturnType<typeof readHostLifecycle>;
};

/** Read the public lifecycle at mutation time; never trust a Manager snapshot. */
export function checkHostLifecycleAction(
  ctx: SetupContext,
  action: HostLifecycleAction,
): HostLifecycleActionCheck {
  const envPath = path.join(ctx.home, '.env');
  const envExists = fs.existsSync(envPath);
  let lifecycle;
  try {
    lifecycle = readHostLifecycle(
      ctx.home,
      envExists ? readEnvMap(envPath) : new Map<string, string>(),
      envExists,
    );
  } catch {
    lifecycle = readHostLifecycle(ctx.home, new Map<string, string>(), false, 'unknown');
  }
  return { ...evaluateHostLifecycleAction(lifecycle, action), lifecycle };
}

export function assertHostLifecycleAction(
  ctx: SetupContext,
  action: HostLifecycleAction,
): HostLifecycleActionCheck {
  hostMutationLock(ctx.home).assertAvailable();
  assertNoMaintenanceOperation(ctx.home);
  const check = checkHostLifecycleAction(ctx, action);
  if (!check.allowed) {
    throw new SetupApiValidationError(
      `Host-Aktion „${action}“ gesperrt: ${check.reason ?? 'Lifecycle-Prüfung fehlgeschlagen.'}`,
    );
  }
  return check;
}

/** Validate an explicit target configuration, e.g. a fully validated restore. */
export function assertTargetHostLifecycleAction(
  env: Map<string, string>,
  action: HostLifecycleAction,
): HostLifecycleActionCheck {
  const lifecycle = deriveHostLifecycle({
    env,
    envExists: true,
    residues: 'none',
    operation: 'none',
    recovered: false,
  });
  const decision = evaluateHostLifecycleAction(lifecycle, action);
  if (!decision.allowed) {
    throw new SetupApiValidationError(
      `Host-Aktion „${action}“ gesperrt: ${decision.reason ?? 'Lifecycle-Prüfung fehlgeschlagen.'}`,
    );
  }
  return { ...decision, lifecycle };
}
