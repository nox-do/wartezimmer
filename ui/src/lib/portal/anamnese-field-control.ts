import type { FormTemplateField } from './patient-document-api.js';

/** Portal-Feld wie vom Backend geliefert; `portalControl` ist Teil des Vertrags. */
export type PortalFormField = FormTemplateField;

export function anamneseNumberAttrs(field: PortalFormField): {
  min?: number;
  max?: number;
  step?: number | 'any';
} {
  const attrs: { min?: number; max?: number; step?: number | 'any' } = {};
  if (field.min != null) {
    attrs.min = field.min;
  }
  if (field.max != null) {
    attrs.max = field.max;
  }
  if (field.step != null) {
    attrs.step = field.step;
  }
  return attrs;
}

export function anamneseInputType(field: PortalFormField): 'text' | 'email' | 'tel' {
  if (field.id === 'contactEmail') {
    return 'email';
  }
  if (field.id === 'contactPhone') {
    return 'tel';
  }
  return 'text';
}
