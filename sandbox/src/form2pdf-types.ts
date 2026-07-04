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

export function isFormPdfDisplay(value: unknown): value is FormPdfDisplay {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.title !== 'string' || !Array.isArray(record.sections)) {
    return false;
  }
  return record.sections.every((section) => {
    if (!section || typeof section !== 'object') {
      return false;
    }
    const sectionRecord = section as Record<string, unknown>;
    return (
      typeof sectionRecord.title === 'string' &&
      Array.isArray(sectionRecord.fields) &&
      sectionRecord.fields.every((field) => {
        if (!field || typeof field !== 'object') {
          return false;
        }
        const fieldRecord = field as Record<string, unknown>;
        return typeof fieldRecord.label === 'string' && typeof fieldRecord.value === 'string';
      })
    );
  });
}
