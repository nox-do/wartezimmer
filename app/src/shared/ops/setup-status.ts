import type { MessagingProviderCatalog, OpsSettings } from '../db/db-types.js';
import { parseCsvContactLookupMappingOrThrow } from '../contacts/contact-lookup-config.js';
import { validateCsvContactLookupSettings } from '../contacts/contact-lookup-preview.js';
import { getDeploymentStorageSnapshot } from './deployment-storage.js';
import { resolveUserFolderLabel } from './user-folder-labels.js';
import { resolveEffectiveSetupChoices, type SetupProgressRow } from './setup-inference.js';
import { parsePracticeProfileJson } from '../practice/practice-profile.js';
import {
  SETUP_REQUIRED_CHECK_IDS,
  type SetupCheck,
  type SetupContactMode,
  type SetupPhase,
  type SetupRequiredCheckId,
  type SetupWizardStep,
} from './setup-types.js';

const CONTACT_LOOKUP_CONFIGURED_BLOCKERS = new Set([
  'CONTACT_LOOKUP_FOLDER_NOT_SET',
  'CONTACT_LOOKUP_INVALID_PATH',
]);

export type SetupStatusDb = {
  getOpsSettings(): OpsSettings;
  getMessagingProviderCatalog(): MessagingProviderCatalog;
};

export type SetupStatusSnapshot = {
  phase: SetupPhase;
  setupCompletedAt: string | null;
  setupLastStep: SetupWizardStep;
  portalEnabled: boolean;
  setupContactMode: SetupContactMode;
  checks: SetupCheck[];
  userFolders: {
    imports: string;
    exports: string;
  };
  requiredChecksOk: boolean;
  /** False on GET onboarding until POST …/onboarding/verify runs expensive probes. */
  checksVerified: boolean;
};

export type BuildSetupStatusOptions = {
  verify: boolean;
};

const VERIFY_PENDING_HINT = 'SETUP_VERIFY_PENDING';

async function evaluateContactLookupChecks(
  settings: OpsSettings,
  contactMode: SetupContactMode,
  verify: boolean,
): Promise<{
  configured: boolean;
  parseable: boolean;
  configuredHint: string | null;
  parseableHint: string | null;
}> {
  if (contactMode === 'unset') {
    return {
      configured: false,
      parseable: false,
      configuredHint: 'SETUP_CONTACT_MODE_UNSET',
      parseableHint: 'SETUP_CONTACT_MODE_UNSET',
    };
  }

  const folderPath = settings.contactLookupFolderPath?.trim() ?? '';
  if (!folderPath) {
    return {
      configured: false,
      parseable: false,
      configuredHint: 'CONTACT_LOOKUP_FOLDER_NOT_SET',
      parseableHint: 'CONTACT_LOOKUP_FOLDER_NOT_SET',
    };
  }

  let mapping;
  try {
    mapping = parseCsvContactLookupMappingOrThrow(JSON.parse(settings.contactLookupMappingJson));
  } catch {
    return {
      configured: Boolean(folderPath),
      parseable: false,
      configuredHint: folderPath ? null : 'CONTACT_LOOKUP_FOLDER_NOT_SET',
      parseableHint: 'CONTACT_LOOKUP_MAPPING_INVALID',
    };
  }

  if (!verify) {
    return {
      configured: Boolean(folderPath),
      parseable: false,
      configuredHint: folderPath ? null : 'CONTACT_LOOKUP_FOLDER_NOT_SET',
      parseableHint: VERIFY_PENDING_HINT,
    };
  }

  try {
    await validateCsvContactLookupSettings({
      folderPath,
      delimiterMode: settings.contactLookupDelimiterMode,
      hasHeader: settings.contactLookupHasHeader,
      mapping,
    });
    return {
      configured: true,
      parseable: true,
      configuredHint: null,
      parseableHint: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'CONTACT_LOOKUP_VALIDATION_FAILED';
    const configured = !CONTACT_LOOKUP_CONFIGURED_BLOCKERS.has(message);
    return {
      configured,
      parseable: false,
      configuredHint: configured ? null : message,
      parseableHint: message,
    };
  }
}

function evaluateMessagingChecks(
  db: SetupStatusDb,
  settings: OpsSettings,
): { configured: boolean; providerSelected: boolean; hint: string | null } {
  const catalog = db.getMessagingProviderCatalog();
  const providers = catalog.channels.flatMap((channel) => channel.providers);
  const smsProvider = settings.smsProvider?.trim() ?? '';

  if (smsProvider === 'mock' || smsProvider.length === 0) {
    return {
      configured: false,
      providerSelected: false,
      hint: 'MESSAGING_REAL_PROVIDER_REQUIRED',
    };
  }

  const selected = providers.find((provider) => provider.id === smsProvider);
  const providerSelected = Boolean(selected);
  const configured = Boolean(selected?.configured && selected.enabled);

  if (!providerSelected) {
    return { configured: false, providerSelected: false, hint: 'MESSAGING_PROVIDER_NOT_SELECTED' };
  }
  if (!configured) {
    return { configured: false, providerSelected: true, hint: 'MESSAGING_PROVIDER_NOT_CONFIGURED' };
  }

  return { configured: true, providerSelected: true, hint: null };
}

function resolvePhase(setupCompletedAt: string | null, setupLastStep: SetupWizardStep): SetupPhase {
  if (setupCompletedAt) {
    return 'completed';
  }
  if (setupLastStep === 'verify') {
    return 'wizard_in_progress';
  }
  if (setupLastStep === 'welcome') {
    return 'pristine';
  }
  return 'wizard_in_progress';
}

export async function buildSetupStatusSnapshot(
  db: SetupStatusDb,
  setup: SetupProgressRow,
  options: BuildSetupStatusOptions = { verify: false },
): Promise<SetupStatusSnapshot> {
  const { verify } = options;
  const settings = db.getOpsSettings();
  const effective = resolveEffectiveSetupChoices(setup, settings);

  const storage = verify ? await getDeploymentStorageSnapshot() : null;
  const contact = await evaluateContactLookupChecks(settings, effective.setupContactMode, verify);
  const messaging = evaluateMessagingChecks(db, settings);
  const practiceProfile = parsePracticeProfileJson(settings.practiceProfileJson);
  const practiceDisplayNameOk = practiceProfile.displayName.trim().length > 0;

  const checks: SetupCheck[] = [
    {
      id: 'practiceProfile.configured',
      ok: practiceDisplayNameOk,
      required: true,
      hint: practiceDisplayNameOk ? null : 'PRACTICE_PROFILE_DISPLAY_NAME_MISSING',
    },
    {
      id: 'storage.importsReady',
      ok: storage?.imports.ready ?? false,
      required: true,
      hint: storage?.imports.hint ?? VERIFY_PENDING_HINT,
    },
    {
      id: 'storage.exportsReady',
      ok: storage?.exports.ready ?? false,
      required: true,
      hint: storage?.exports.hint ?? VERIFY_PENDING_HINT,
    },
    {
      id: 'contactLookup.configured',
      ok: contact.configured,
      required: true,
      hint: contact.configuredHint,
    },
    {
      id: 'contactLookup.parseable',
      ok: contact.parseable,
      required: true,
      hint: contact.parseableHint,
    },
    {
      id: 'messaging.configured',
      ok: messaging.configured,
      required: false,
      hint: messaging.hint,
    },
    {
      id: 'messaging.providerSelected',
      ok: messaging.providerSelected,
      required: false,
      hint: messaging.providerSelected ? null : messaging.hint,
    },
  ];

  const requiredChecksOk =
    verify &&
    SETUP_REQUIRED_CHECK_IDS.every(
      (id: SetupRequiredCheckId) => checks.find((check) => check.id === id)?.ok === true,
    );

  return {
    phase: resolvePhase(effective.setupCompletedAt, effective.setupLastStep),
    setupCompletedAt: effective.setupCompletedAt,
    setupLastStep: effective.setupLastStep,
    portalEnabled: effective.portalEnabled,
    setupContactMode: effective.setupContactMode,
    checks,
    userFolders: {
      imports: resolveUserFolderLabel('IMPORTS_HOST_PATH', 'imports'),
      exports: resolveUserFolderLabel('EXPORTS_HOST_PATH', 'exports'),
    },
    requiredChecksOk,
    checksVerified: verify,
  };
}
