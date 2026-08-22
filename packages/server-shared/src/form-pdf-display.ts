export type FormPdfDisplayMeta = {
  label: string;
  value: string;
};

export type FormPdfDisplayField = {
  label: string;
  value: string;
};

export type FormPdfDisplaySection = {
  title: string;
  fields: FormPdfDisplayField[];
};

export type FormPdfDisplay = {
  title: string;
  subtitle?: string;
  meta?: FormPdfDisplayMeta[];
  sections: FormPdfDisplaySection[];
};

function isNonNullObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isLabeledValue(value: unknown): value is { label: string; value: string } {
  if (!isNonNullObject(value)) {
    return false;
  }
  return typeof value.label === 'string' && typeof value.value === 'string';
}

function isFormPdfDisplaySection(value: unknown): value is FormPdfDisplaySection {
  if (!isNonNullObject(value)) {
    return false;
  }
  return (
    typeof value.title === 'string' &&
    Array.isArray(value.fields) &&
    value.fields.every(isLabeledValue)
  );
}

export function isFormPdfDisplay(value: unknown): value is FormPdfDisplay {
  if (!isNonNullObject(value)) {
    return false;
  }
  if (typeof value.title !== 'string') {
    return false;
  }
  if (value.subtitle !== undefined && typeof value.subtitle !== 'string') {
    return false;
  }
  if (value.meta !== undefined) {
    if (!Array.isArray(value.meta) || !value.meta.every(isLabeledValue)) {
      return false;
    }
  }
  return Array.isArray(value.sections) && value.sections.every(isFormPdfDisplaySection);
}
