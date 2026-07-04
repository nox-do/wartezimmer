import type { FormTemplateField } from './patient-document-api.js';

/** Wie das Feld im Portal gerendert wird (mobile-first). Metadaten kommen vom Backend-Template. */
export type AnamneseFieldControl = 'checkbox' | 'compact' | 'input' | 'textarea-short' | 'textarea';

export type PortalFormField = FormTemplateField & {
  portalControl?: AnamneseFieldControl;
  min?: number;
  max?: number;
  step?: number;
  hideInPortalForm?: boolean;
  hideWhenCheckinPhone?: boolean;
};

function inferAnamneseFieldControl(field: PortalFormField): AnamneseFieldControl {
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

export function resolveAnamneseFieldControl(field: PortalFormField): AnamneseFieldControl {
  return field.portalControl ?? inferAnamneseFieldControl(field);
}

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
