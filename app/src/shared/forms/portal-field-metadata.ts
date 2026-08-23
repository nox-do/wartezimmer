import type { FormTemplateField } from './template-types.js';

export const FORM_PORTAL_CONTROLS = [
  'checkbox',
  'compact',
  'input',
  'textarea-short',
  'textarea',
] as const;

export type FormPortalControl = (typeof FORM_PORTAL_CONTROLS)[number];

export type PortalFormField = FormTemplateField & {
  portalControl: FormPortalControl;
  min?: number;
  max?: number;
  step?: number;
  hideInPortalForm?: boolean;
  hideWhenCheckinPhone?: boolean;
};

type PortalFieldMeta = Pick<
  PortalFormField,
  'portalControl' | 'min' | 'max' | 'step' | 'hideInPortalForm' | 'hideWhenCheckinPhone'
>;

const ALLGEMEINMEDIZIN_PORTAL: Record<string, PortalFieldMeta> = {
  fullName: { portalControl: 'input' },
  birthDate: { portalControl: 'compact' },
  contactPhone: { portalControl: 'compact', hideWhenCheckinPhone: true },
  contactEmail: { portalControl: 'input' },
  mainConcern: { portalControl: 'textarea' },
  symptomSince: { portalControl: 'input' },
  painScale: { portalControl: 'compact', min: 0, max: 10, step: 1 },
  knownDiagnoses: { portalControl: 'textarea' },
  pastOperations: { portalControl: 'textarea' },
  currentMedication: { portalControl: 'textarea' },
  knownAllergies: { portalControl: 'textarea' },
  allergyReactionNotes: { portalControl: 'textarea-short' },
  familyHistoryCardio: { portalControl: 'checkbox' },
  familyHistoryDiabetes: { portalControl: 'checkbox' },
  familyHistoryCancer: { portalControl: 'checkbox' },
  smoker: { portalControl: 'checkbox' },
  cigarettesPerDay: { portalControl: 'compact', min: 0, step: 1 },
  alcoholPerWeek: { portalControl: 'input' },
  substanceUse: { portalControl: 'checkbox' },
  sleepQuality: { portalControl: 'textarea-short' },
  digestiveOrUrinaryIssues: { portalControl: 'checkbox' },
  mentalHealthHistory: { portalControl: 'textarea-short' },
  heightCm: { portalControl: 'compact', min: 50, max: 260, step: 1 },
  weightKg: { portalControl: 'compact', min: 1, max: 500, step: 0.1 },
  pregnant: { portalControl: 'checkbox' },
  socialSituation: { portalControl: 'textarea-short' },
  careLevelOrSupportNeeds: { portalControl: 'input' },
  vaccinationOrInfectionNotes: { portalControl: 'textarea-short' },
  patientGoals: { portalControl: 'textarea-short' },
  consentDataProcessing: { portalControl: 'checkbox', hideInPortalForm: true },
};

function inferPortalControl(field: FormTemplateField): FormPortalControl {
  if (field.type === 'boolean') {
    return 'checkbox';
  }
  if (field.type === 'date' || field.type === 'number') {
    return 'compact';
  }
  if (field.type === 'text') {
    const max = field.maxLength ?? 0;
    if (max <= 200) {
      return 'input';
    }
    if (max <= 600) {
      return 'textarea-short';
    }
    return 'textarea';
  }
  return 'input';
}

export function toPortalFormFields(
  templateId: string,
  fields: FormTemplateField[],
): PortalFormField[] {
  const metadata = templateId === 'allgemeinmedizin-erstanamnese' ? ALLGEMEINMEDIZIN_PORTAL : null;

  return fields.map((field) => {
    const meta = metadata?.[field.id];
    return {
      ...field,
      ...meta,
      portalControl: meta?.portalControl ?? inferPortalControl(field),
    };
  });
}
