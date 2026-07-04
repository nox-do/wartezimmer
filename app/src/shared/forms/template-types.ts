export type FormFieldType = 'text' | 'number' | 'boolean' | 'date';

/** Portal/product grouping — not used by document lifecycle. */
export type FormTemplateCategory = 'questionnaire' | 'consent' | 'short' | 'master' | 'special';

export type FormKind = 'questionnaire' | 'consent';

export type FormTemplateField = {
  id: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  maxLength?: number;
};

/** Single source for portal grouping (titleKey) and MFA PDF section titles (pdfTitle). */
export type FormSectionLayout = {
  titleKey: string;
  pdfTitle: string;
  fieldIds: string[];
};

export type FormTemplateDefinition = {
  id: string;
  name: string;
  version: number;
  category: FormTemplateCategory;
  formKind: FormKind;
  /** Consent templates must follow a questionnaire item in the same batch. */
  requiresQuestionnaireInBatch?: boolean;
  fields: FormTemplateField[];
  /** Questionnaire layout; omit for consent-only templates. */
  sections?: FormSectionLayout[];
};

export type FormTemplateDescriptor = {
  id: string;
  name: string;
  version: number;
  category: FormTemplateCategory;
  formKind: FormKind;
};
