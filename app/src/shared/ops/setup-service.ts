import type { OpsSettings } from '../db/db-types.js';
import {
  completeOpsSetupInDb,
  getOpsSetupFromDb,
  reopenOpsSetupInDb,
  updateOpsSetupProgressInDb,
  type OpsSetupDeps,
} from '../db/database-ops-setup.js';
import { assertSyncSetupReadyForComplete } from './setup-complete-guard.js';
import { buildSetupHydrationPatch, resolveEffectiveSetupChoices } from './setup-inference.js';
import {
  buildSetupStatusSnapshot,
  type SetupStatusDb,
  type SetupStatusSnapshot,
} from './setup-status.js';
import type { SetupContactMode, SetupWizardStep } from './setup-types.js';
import { domainError } from '../errors/domain-error.js';

export type SetupDatabase = SetupStatusDb & {
  setupDeps(): OpsSetupDeps;
  getOpsSettings(): OpsSettings;
  withTransaction<T>(operationName: string, fn: () => T): T;
};

export type ReadSetupStatusOptions = {
  verify?: boolean;
};

export async function hydrateSetupProgressFromSystem(db: SetupDatabase): Promise<void> {
  const setup = getOpsSetupFromDb(db.setupDeps());
  const settings = db.getOpsSettings();
  const hydrationPatch = buildSetupHydrationPatch(setup, settings);

  if (hydrationPatch) {
    db.withTransaction('hydrateSetupProgress', () => {
      updateOpsSetupProgressInDb(db.setupDeps(), hydrationPatch);
    });
  }
}

export async function readSetupStatusSnapshot(
  db: SetupDatabase,
  options: ReadSetupStatusOptions = {},
): Promise<SetupStatusSnapshot> {
  const verify = options.verify ?? false;
  await hydrateSetupProgressFromSystem(db);
  const setup = getOpsSetupFromDb(db.setupDeps());
  return buildSetupStatusSnapshot(db, setup, { verify });
}

export function persistSetupProgress(
  db: SetupDatabase,
  patch: {
    lastStep?: SetupWizardStep;
    portalEnabled?: boolean;
    contactMode?: SetupContactMode;
  },
) {
  return db.withTransaction('updateSetupProgress', () =>
    updateOpsSetupProgressInDb(db.setupDeps(), patch),
  );
}

export async function completeSetupInDb(
  db: SetupDatabase,
): Promise<{ setupCompletedAt: string; status: SetupStatusSnapshot }> {
  const preview = await readSetupStatusSnapshot(db, { verify: true });
  if (!preview.requiredChecksOk) {
    throw domainError('SETUP_REQUIRED_CHECKS_INCOMPLETE');
  }

  const result = db.withTransaction('completeSetup', () => {
    const setup = getOpsSetupFromDb(db.setupDeps());
    if (setup.setupCompletedAt) {
      throw domainError('SETUP_ALREADY_COMPLETED');
    }
    const settings = db.getOpsSettings();
    const effective = resolveEffectiveSetupChoices(setup, settings);
    assertSyncSetupReadyForComplete(settings, effective.setupContactMode);
    return completeOpsSetupInDb(db.setupDeps());
  });
  const status = await readSetupStatusSnapshot(db, { verify: true });
  return { setupCompletedAt: result.setupCompletedAt, status };
}

export async function reopenSetupInDb(db: SetupDatabase): Promise<SetupStatusSnapshot> {
  db.withTransaction('reopenSetup', () => {
    reopenOpsSetupInDb(db.setupDeps());
  });
  return readSetupStatusSnapshot(db, { verify: false });
}
