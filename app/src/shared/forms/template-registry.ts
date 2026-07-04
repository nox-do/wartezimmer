import { FORM_TEMPLATE_DEFINITIONS } from './templates/definitions/index.js';
import { toPortalFormFields } from './portal-field-metadata.js';
import type { FormTemplateDefinition, FormTemplateDescriptor } from './template-types.js';

export type {
  FormFieldType,
  FormKind,
  FormSectionLayout,
  FormTemplateCategory,
  FormTemplateDefinition,
  FormTemplateDescriptor,
  FormTemplateField,
} from './template-types.js';

/** Portal-facing slice of a template (fields + section layout from registry). */
export function toPortalFormTemplate(template: FormTemplateDefinition) {
  return {
    id: template.id,
    name: template.name,
    version: template.version,
    fields: toPortalFormFields(template.id, template.fields),
    sections: (template.sections ?? []).map(({ titleKey, fieldIds }) => ({ titleKey, fieldIds })),
  };
}

export function listFormTemplateDescriptors(): FormTemplateDescriptor[] {
  return FORM_TEMPLATE_DEFINITIONS.map(({ id, name, version, category, formKind }) => ({
    id,
    name,
    version,
    category,
    formKind,
  }));
}

/** Questionnaire templates exposed for portal pickers (excludes consent-only templates). */
export function listPortalFormTemplateDescriptors(): FormTemplateDescriptor[] {
  return listFormTemplateDescriptors().filter((item) => item.formKind === 'questionnaire');
}

export function getFormTemplate(
  templateId: string,
  templateVersion?: number,
): FormTemplateDefinition | null {
  const normalizedId = templateId.trim();
  if (normalizedId.length === 0) {
    return null;
  }

  const candidates = FORM_TEMPLATE_DEFINITIONS.filter((item) => item.id === normalizedId);
  if (candidates.length === 0) {
    return null;
  }

  if (templateVersion == null) {
    return [...candidates].sort((left, right) => right.version - left.version)[0] ?? null;
  }

  return candidates.find((item) => item.version === templateVersion) ?? null;
}

export function validateFormAnswers(
  template: FormTemplateDefinition,
  answers: Record<string, unknown>,
): string[] {
  const errors: string[] = [];
  const fields = toPortalFormFields(template.id, template.fields);
  const allowedFieldIds = new Set(fields.map((field) => field.id));

  for (const key of Object.keys(answers)) {
    if (!allowedFieldIds.has(key)) {
      errors.push(`Field "${key}" is not part of template "${template.id}" v${template.version}.`);
    }
  }

  for (const field of fields) {
    const value = answers[field.id];
    if (value == null || value === '') {
      if (field.required) {
        errors.push(`Field "${field.id}" is required.`);
      }
      continue;
    }

    switch (field.type) {
      case 'text':
        if (typeof value !== 'string') {
          errors.push(`Field "${field.id}" must be a string.`);
          break;
        }
        if (field.maxLength && value.length > field.maxLength) {
          errors.push(`Field "${field.id}" exceeds max length ${field.maxLength}.`);
        }
        break;
      case 'number':
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          errors.push(`Field "${field.id}" must be a finite number.`);
          break;
        }
        if (field.min != null && value < field.min) {
          errors.push(`Field "${field.id}" must be at least ${field.min}.`);
        }
        if (field.max != null && value > field.max) {
          errors.push(`Field "${field.id}" must be at most ${field.max}.`);
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push(`Field "${field.id}" must be a boolean.`);
          break;
        }
        if (field.required && value !== true) {
          errors.push(`Field "${field.id}" must be accepted.`);
        }
        break;
      case 'date':
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          errors.push(`Field "${field.id}" must be in format YYYY-MM-DD.`);
          break;
        }
        {
          const parsed = new Date(`${value}T00:00:00.000Z`);
          const roundtrip = Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
          if (roundtrip !== value) {
            errors.push(`Field "${field.id}" must contain a valid calendar date.`);
          }
        }
        break;
      default:
        errors.push(`Field "${field.id}" has unsupported type.`);
        break;
    }
  }

  return errors;
}
