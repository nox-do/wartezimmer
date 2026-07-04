import type { FormTemplateDefinition } from '../../template-types.js';

export const datenschutzEinwilligungV1: FormTemplateDefinition = {
  id: 'datenschutz-einwilligung',
  name: 'Datenschutzeinwilligung',
  version: 1,
  category: 'consent',
  formKind: 'consent',
  requiresQuestionnaireInBatch: true,
  fields: [
    {
      id: 'einwilligung',
      label: 'Einwilligung zur Datenverarbeitung',
      type: 'boolean',
      required: true,
    },
  ],
};
