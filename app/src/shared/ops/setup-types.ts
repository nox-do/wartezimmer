export const SETUP_WIZARD_STEPS = [
  'welcome',
  'practice',
  'storage',
  'contacts',
  'messaging',
  'portal',
  'summary',
  'verify',
] as const;

export type SetupWizardStep = (typeof SETUP_WIZARD_STEPS)[number];

export const SETUP_CONTACT_MODES = ['unset', 'sample', 'own'] as const;

export type SetupContactMode = (typeof SETUP_CONTACT_MODES)[number];

export const SETUP_PHASES = ['pristine', 'wizard_in_progress', 'completed'] as const;

export type SetupPhase = (typeof SETUP_PHASES)[number];

export const SETUP_REQUIRED_CHECK_IDS = [
  'practiceProfile.configured',
  'storage.importsReady',
  'storage.exportsReady',
  'contactLookup.configured',
  'contactLookup.parseable',
] as const;

export type SetupRequiredCheckId = (typeof SETUP_REQUIRED_CHECK_IDS)[number];

export type SetupCheck = {
  id: string;
  ok: boolean;
  required: boolean;
  hint: string | null;
};
