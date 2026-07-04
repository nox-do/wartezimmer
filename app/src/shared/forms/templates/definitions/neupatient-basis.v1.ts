import type { FormTemplateDefinition } from '../../template-types.js';

export const neupatientBasisV1: FormTemplateDefinition = {
  id: 'neupatient-basis',
  name: 'Neupatient Basisanamnese',
  version: 1,
  category: 'questionnaire',
  formKind: 'questionnaire',
  fields: [
    { id: 'fullName', label: 'Vollständiger Name', type: 'text', required: true, maxLength: 160 },
    { id: 'birthDate', label: 'Geburtsdatum', type: 'date', required: true },
    {
      id: 'knownAllergies',
      label: 'Bekannte Allergien',
      type: 'text',
      required: false,
      maxLength: 1500,
    },
    {
      id: 'currentMedication',
      label: 'Aktuelle Medikation',
      type: 'text',
      required: false,
      maxLength: 1500,
    },
    { id: 'pregnant', label: 'Schwangerschaft', type: 'boolean', required: false },
    { id: 'weightKg', label: 'Gewicht (kg)', type: 'number', required: false },
  ],
};
