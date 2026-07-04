import { allgemeinmedizinErstanamneseV1 } from './allgemeinmedizin-erstanamnese.v1.js';
import { datenschutzEinwilligungV1 } from './datenschutz-einwilligung.v1.js';
import { neupatientBasisV1 } from './neupatient-basis.v1.js';
import type { FormTemplateDefinition } from '../../template-types.js';

export const FORM_TEMPLATE_DEFINITIONS: FormTemplateDefinition[] = [
  neupatientBasisV1,
  allgemeinmedizinErstanamneseV1,
  datenschutzEinwilligungV1,
];
