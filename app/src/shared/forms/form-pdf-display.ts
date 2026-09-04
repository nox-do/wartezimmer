import type {
  FormPdfDisplay,
  FormPdfDisplayField,
  FormPdfDisplayMeta,
  FormPdfDisplaySection,
} from '@praxis-flow/server-shared';
import type { FormTemplateDefinition, FormTemplateField } from './template-types.js';
import { buildFormPrivacyNoticeV2 } from './consent/privacy-notice-v1.js';
import { getCoreDatabase } from '../db/database.js';
import { getPracticeProfileForDb } from '../practice/practice-profile-service.js';
import { buildConsentPatientSnapshot } from './consent/patient-consent-snapshot.js';
import { formatTicketCode } from '../queue/ticket-code.js';

export type { FormPdfDisplay, FormPdfDisplayField, FormPdfDisplayMeta, FormPdfDisplaySection };

export type FormPdfBatchContext = {
  ticketCode: string;
  laneCode: string;
  ticketNumber: number;
  submittedAt: string;
  primaryQuestionnaire?: {
    template: FormTemplateDefinition;
    answers: Record<string, unknown>;
  };
};

function formatGermanDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return isoDate;
  }
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed);
}

function formatGermanDateTime(isoDateTime: string): string {
  const parsed = new Date(isoDateTime);
  if (Number.isNaN(parsed.getTime())) {
    return isoDateTime;
  }
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function formatFieldValue(field: FormTemplateField, value: unknown): string | null {
  if (value == null || value === '') {
    return null;
  }

  if (field.type === 'boolean') {
    return value === true ? 'Ja' : 'Nein';
  }

  if (field.type === 'date' && typeof value === 'string') {
    return formatGermanDate(value);
  }

  if (field.type === 'number' && typeof value === 'number' && Number.isFinite(value)) {
    if (field.id === 'painScale') {
      return `${value} von 10`;
    }
    if (field.id === 'heightCm') {
      return `${value} cm`;
    }
    if (field.id === 'weightKg') {
      return `${value} kg`;
    }
    return String(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return String(value);
}

function fieldById(template: FormTemplateDefinition): Map<string, FormTemplateField> {
  return new Map(template.fields.map((field) => [field.id, field]));
}

function buildQuestionnaireFormPdfDisplay(input: {
  template: FormTemplateDefinition;
  answers: Record<string, unknown>;
  ticketCode: string;
  submittedAt: string;
}): FormPdfDisplay {
  const fields = fieldById(input.template);
  const layoutSections = input.template.sections ?? [];
  const displaySections: FormPdfDisplaySection[] = [];

  for (const section of layoutSections) {
    const sectionFields: FormPdfDisplayField[] = [];
    for (const fieldId of section.fieldIds) {
      if (fieldId === 'consentDataProcessing') {
        continue;
      }
      const field = fields.get(fieldId);
      if (!field) {
        continue;
      }
      const formatted = formatFieldValue(field, input.answers[fieldId]);
      if (formatted == null) {
        continue;
      }
      sectionFields.push({ label: field.label, value: formatted });
    }
    if (sectionFields.length > 0) {
      displaySections.push({ title: section.pdfTitle, fields: sectionFields });
    }
  }

  const usedIds = new Set(layoutSections.flatMap((section) => section.fieldIds));
  const remaining: FormPdfDisplayField[] = [];
  for (const field of input.template.fields) {
    if (usedIds.has(field.id) || field.id === 'consentDataProcessing') {
      continue;
    }
    const formatted = formatFieldValue(field, input.answers[field.id]);
    if (formatted != null) {
      remaining.push({ label: field.label, value: formatted });
    }
  }
  if (remaining.length > 0) {
    displaySections.push({ title: 'Weitere Angaben', fields: remaining });
  }

  return {
    title: input.template.name,
    subtitle: 'Formular · Patientenportal',
    meta: [
      { label: 'Wartenummer', value: input.ticketCode },
      { label: 'Übermittelt am', value: formatGermanDateTime(input.submittedAt) },
      { label: 'Formular', value: `${input.template.id} (Version ${input.template.version})` },
    ],
    sections: displaySections,
  };
}

function buildConsentFormPdfDisplay(input: {
  template: FormTemplateDefinition;
  answers: Record<string, unknown>;
  batch: FormPdfBatchContext;
}): FormPdfDisplay {
  const primary = input.batch.primaryQuestionnaire;
  if (!primary) {
    throw new Error('FORM_CONSENT_REQUIRES_PRIMARY');
  }

  const patient = buildConsentPatientSnapshot(primary.answers);
  const ticketCode = formatTicketCode(input.batch.laneCode, input.batch.ticketNumber);
  const privacyNotice = buildFormPrivacyNoticeV2(getPracticeProfileForDb(getCoreDatabase()));

  return {
    title: input.template.name,
    subtitle: 'Patientenportal · Einwilligung zur Datenverarbeitung',
    meta: [
      { label: 'Wartenummer', value: ticketCode },
      { label: 'Zeitpunkt', value: formatGermanDateTime(input.batch.submittedAt) },
      { label: 'Bezug-Formular', value: `${primary.template.name} (v${primary.template.version})` },
    ],
    sections: [
      {
        title: 'Patient',
        fields: [
          { label: 'Name', value: patient.patientFullName ?? '—' },
          {
            label: 'Geburtsdatum',
            value: patient.patientBirthDate ? formatGermanDate(patient.patientBirthDate) : '—',
          },
          { label: 'Telefon', value: patient.patientPhone ?? '—' },
        ],
      },
      {
        title: privacyNotice.title,
        fields: privacyNotice.paragraphs.map((paragraph) => ({
          label: '',
          value: paragraph,
        })),
      },
      {
        title: 'Bestätigung',
        fields: [
          {
            label: 'Einwilligung',
            value:
              'Der Patient hat die Datenschutzhinweise gelesen und willigt in die Verarbeitung seiner Angaben, einschließlich Gesundheitsdaten, zum genannten Zweck ein.',
          },
        ],
      },
    ],
  };
}

export function buildFormPdfDisplay(input: {
  template: FormTemplateDefinition;
  answers: Record<string, unknown>;
  batch: FormPdfBatchContext;
}): FormPdfDisplay {
  if (input.template.formKind === 'consent') {
    return buildConsentFormPdfDisplay(input);
  }
  return buildQuestionnaireFormPdfDisplay({
    template: input.template,
    answers: input.answers,
    ticketCode: input.batch.ticketCode,
    submittedAt: input.batch.submittedAt,
  });
}
