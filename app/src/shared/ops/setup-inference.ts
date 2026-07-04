import { parseCsvContactLookupMappingOrThrow } from '../contacts/contact-lookup-config.js';
import { resolveContactLookupBasePath } from '../contacts/contact-lookup-paths.js';
import { DEMO_CONTACT_LOOKUP_MAPPING_JSON } from '../contacts/ensure-demo-contact-csv.js';
import type { OpsSettings } from '../db/db-types.js';
import type { SetupContactMode, SetupWizardStep } from './setup-types.js';

export type SetupProgressRow = {
  setupCompletedAt: string | null;
  setupLastStep: SetupWizardStep;
  portalEnabled: boolean;
  setupContactMode: SetupContactMode;
};

function folderUsesDemoImportsRoot(folderPath: string): boolean {
  const normalized = folderPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const demoRoot = resolveContactLookupBasePath().replace(/\\/g, '/').replace(/\/+$/, '');
  return normalized === demoRoot;
}

export function isDemoContactLookupSettings(
  settings: Pick<
    OpsSettings,
    | 'contactLookupFolderPath'
    | 'contactLookupDelimiterMode'
    | 'contactLookupHasHeader'
    | 'contactLookupMappingJson'
  >,
): boolean {
  const folderPath = settings.contactLookupFolderPath?.trim() ?? '';
  if (!folderPath || !folderUsesDemoImportsRoot(folderPath)) {
    return false;
  }
  if (settings.contactLookupDelimiterMode !== 'semicolon' || !settings.contactLookupHasHeader) {
    return false;
  }

  try {
    const mapping = parseCsvContactLookupMappingOrThrow(
      JSON.parse(settings.contactLookupMappingJson),
    );
    const demo = parseCsvContactLookupMappingOrThrow(JSON.parse(DEMO_CONTACT_LOOKUP_MAPPING_JSON));
    return (
      String(mapping.mobile) === String(demo.mobile) &&
      String(mapping.firstName ?? '') === String(demo.firstName ?? '') &&
      String(mapping.lastName ?? '') === String(demo.lastName ?? '') &&
      String(mapping.birthDate ?? '') === String(demo.birthDate ?? '')
    );
  } catch {
    return false;
  }
}

export function inferSetupContactMode(
  stored: SetupContactMode,
  settings: OpsSettings,
): SetupContactMode {
  const folderPath = settings.contactLookupFolderPath?.trim() ?? '';

  if (stored === 'sample' && folderPath && !isDemoContactLookupSettings(settings)) {
    return 'own';
  }
  if (stored !== 'unset') {
    return stored;
  }
  if (!folderPath) {
    return 'unset';
  }
  return isDemoContactLookupSettings(settings) ? 'sample' : 'own';
}

export function resolveEffectiveSetupChoices(
  setup: SetupProgressRow,
  settings: OpsSettings,
): SetupProgressRow {
  return {
    ...setup,
    setupContactMode: inferSetupContactMode(setup.setupContactMode, settings),
  };
}

export function buildSetupHydrationPatch(
  setup: SetupProgressRow,
  settings: OpsSettings,
): { contactMode?: SetupContactMode } | null {
  const effective = resolveEffectiveSetupChoices(setup, settings);
  const patch: { contactMode?: SetupContactMode } = {};

  if (setup.setupContactMode !== effective.setupContactMode) {
    const staleSample = setup.setupContactMode === 'sample' && effective.setupContactMode === 'own';
    if (setup.setupContactMode === 'unset' || staleSample) {
      patch.contactMode = effective.setupContactMode;
    }
  }

  return Object.keys(patch).length > 0 ? patch : null;
}
