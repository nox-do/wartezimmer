import type { DatabaseSync, StatementSync } from 'node:sqlite';
import {
  SETUP_CONTACT_MODES,
  SETUP_WIZARD_STEPS,
  type SetupContactMode,
  type SetupWizardStep,
} from '../ops/setup-types.js';
import { domainError } from '../errors/domain-error.js';

export type OpsSetupRow = {
  setupCompletedAt: string | null;
  setupLastStep: string | null;
  portalEnabled: boolean;
  setupContactMode: string;
};

type SetupStatements = {
  getOpsSetupStmt: StatementSync;
  updateOpsSetupProgressStmt: StatementSync;
  completeOpsSetupStmt: StatementSync;
  reopenOpsSetupStmt: StatementSync;
};

export type OpsSetupDeps = SetupStatements & { nowIso: () => string };

function normalizePortalEnabled(raw: number | boolean | undefined): boolean {
  if (typeof raw === 'boolean') {
    return raw;
  }
  return raw === 1;
}

function normalizeLastStep(raw: string | null | undefined): SetupWizardStep {
  const value = raw?.trim() ?? 'welcome';
  if (value === 'summary') {
    return 'verify';
  }
  if (value === 'gateway') {
    return 'portal';
  }
  return SETUP_WIZARD_STEPS.includes(value as SetupWizardStep)
    ? (value as SetupWizardStep)
    : 'welcome';
}

function normalizeContactMode(raw: string | undefined): SetupContactMode {
  const value = raw?.trim() ?? 'unset';
  return SETUP_CONTACT_MODES.includes(value as SetupContactMode)
    ? (value as SetupContactMode)
    : 'unset';
}

export function ensureOpsSetupSchema(db: DatabaseSync): void {
  const columns = new Set(
    (
      db.prepare('PRAGMA table_info(ops_settings)').all() as Array<{
        name?: string;
      }>
    )
      .map((column) => column.name)
      .filter((name): name is string => typeof name === 'string'),
  );

  if (!columns.has('setup_completed_at')) {
    db.exec('ALTER TABLE ops_settings ADD COLUMN setup_completed_at TEXT');
  }
  if (!columns.has('setup_last_step')) {
    db.exec("ALTER TABLE ops_settings ADD COLUMN setup_last_step TEXT NOT NULL DEFAULT 'welcome'");
  }
  if (!columns.has('portal_enabled')) {
    db.exec('ALTER TABLE ops_settings ADD COLUMN portal_enabled INTEGER NOT NULL DEFAULT 0');
  }
  if (!columns.has('setup_contact_mode')) {
    db.exec("ALTER TABLE ops_settings ADD COLUMN setup_contact_mode TEXT NOT NULL DEFAULT 'unset'");
  }
}

export function getOpsSetupFromDb(deps: SetupStatements): OpsSetupRow & {
  setupLastStep: SetupWizardStep;
  portalEnabled: boolean;
  setupContactMode: SetupContactMode;
} {
  const row = deps.getOpsSetupStmt.get() as
    | {
        setupCompletedAt?: string | null;
        setupLastStep?: string | null;
        portalEnabled?: number;
        setupContactMode?: string;
      }
    | undefined;

  return {
    setupCompletedAt: row?.setupCompletedAt ?? null,
    setupLastStep: normalizeLastStep(row?.setupLastStep),
    portalEnabled: normalizePortalEnabled(row?.portalEnabled),
    setupContactMode: normalizeContactMode(row?.setupContactMode),
  };
}

export function updateOpsSetupProgressInDb(
  deps: SetupStatements & { nowIso: () => string },
  patch: {
    lastStep?: SetupWizardStep;
    portalEnabled?: boolean;
    contactMode?: SetupContactMode;
  },
): OpsSetupRow & {
  setupLastStep: SetupWizardStep;
  portalEnabled: boolean;
  setupContactMode: SetupContactMode;
} {
  const current = getOpsSetupFromDb(deps);
  const nextStep = patch.lastStep ?? current.setupLastStep;
  const nextPortalEnabled = patch.portalEnabled ?? current.portalEnabled;
  const nextContactMode = patch.contactMode ?? current.setupContactMode;

  if (!SETUP_WIZARD_STEPS.includes(nextStep)) {
    throw domainError('SETUP_INVALID_STEP');
  }
  if (!SETUP_CONTACT_MODES.includes(nextContactMode)) {
    throw domainError('SETUP_INVALID_CONTACT_MODE');
  }

  deps.updateOpsSetupProgressStmt.run(
    nextStep,
    nextPortalEnabled ? 1 : 0,
    nextContactMode,
    deps.nowIso(),
  );
  return getOpsSetupFromDb(deps);
}

export function completeOpsSetupInDb(deps: SetupStatements & { nowIso: () => string }): {
  setupCompletedAt: string;
} {
  const completedAt = deps.nowIso();
  deps.completeOpsSetupStmt.run(completedAt, completedAt);
  return { setupCompletedAt: completedAt };
}

export function reopenOpsSetupInDb(deps: SetupStatements & { nowIso: () => string }): void {
  deps.reopenOpsSetupStmt.run('welcome', deps.nowIso());
}

export function createOpsSetupStatements(db: DatabaseSync): SetupStatements {
  return {
    getOpsSetupStmt: db.prepare(
      `SELECT
        setup_completed_at AS setupCompletedAt,
        setup_last_step AS setupLastStep,
        portal_enabled AS portalEnabled,
        setup_contact_mode AS setupContactMode
      FROM ops_settings
      WHERE id = 'singleton'
      LIMIT 1`,
    ),
    updateOpsSetupProgressStmt: db.prepare(
      `UPDATE ops_settings
      SET setup_last_step = ?,
          portal_enabled = ?,
          setup_contact_mode = ?,
          updated_at = ?
      WHERE id = 'singleton'`,
    ),
    completeOpsSetupStmt: db.prepare(
      `UPDATE ops_settings
      SET setup_completed_at = ?,
          setup_last_step = 'summary',
          updated_at = ?
      WHERE id = 'singleton'`,
    ),
    reopenOpsSetupStmt: db.prepare(
      `UPDATE ops_settings
      SET setup_completed_at = NULL,
          setup_last_step = ?,
          updated_at = ?
      WHERE id = 'singleton'`,
    ),
  };
}
