import type { FormTemplateSection } from './patient-document-api.js';
import type { PortalFormField } from './anamnese-field-control.js';

export type { FormTemplateSection as AnamneseFormSection };

export function isAnamneseFieldVisible(field: PortalFormField): boolean {
  return !field.hideInPortalForm;
}

export function orderFieldsBySections(
  fields: PortalFormField[],
  sections: FormTemplateSection[],
): Array<{ section: FormTemplateSection; fields: PortalFormField[] }> {
  const byId = new Map(fields.map((field) => [field.id, field]));
  const used = new Set<string>();

  const grouped = sections
    .map((section) => {
      const sectionFields = section.fieldIds
        .map((id) => byId.get(id))
        .filter((field): field is PortalFormField => field != null);
      for (const field of sectionFields) {
        used.add(field.id);
      }
      return { section, fields: sectionFields };
    })
    .filter((group) => group.fields.length > 0);

  const remaining = fields.filter((field) => !used.has(field.id) && !field.hideInPortalForm);
  if (remaining.length > 0) {
    grouped.push({
      section: {
        titleKey: 'portal.anamneseSectionOther',
        fieldIds: remaining.map((field) => field.id),
      },
      fields: remaining,
    });
  }

  return grouped;
}
