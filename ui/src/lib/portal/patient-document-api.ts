import { patientBearerFetch } from '$lib/api/patient-bearer-fetch';
import type {
  FormPrivacyNotice,
  FormTemplate,
  PatientDocument,
  PatientDocumentListResponse,
  PatientFormDocumentItem,
  PatientFormDocumentsResponse,
} from '$lib/documents/openapi-types';

const MAX_FILE_BYTES = 25_000_000;

/** Fallback until first list response; server returns authoritative value. */
export { MAX_FILE_BYTES };

export type {
  FormPrivacyNotice,
  FormTemplate,
  FormTemplateField,
  FormTemplateSection,
  PatientFormDocumentItem,
} from '$lib/documents/openapi-types';

export const PRIVACY_CONSENT_TEMPLATE_ID = 'datenschutz-einwilligung';
export const PRIVACY_CONSENT_TEMPLATE_VERSION = 1;

export async function fetchPatientDocuments(sessionToken: string) {
  return patientBearerFetch<PatientDocumentListResponse & { uploadMaxBytes?: number }>(
    '/api/v1/patient-documents',
    sessionToken,
  );
}

export async function intakePatientDocument(sessionToken: string, file: File) {
  const formData = new FormData();
  formData.append('file', file, file.name);

  return patientBearerFetch<PatientDocument>('/api/v1/patient-documents/intake', sessionToken, {
    method: 'POST',
    body: formData,
  });
}

export async function submitPatientFormDocuments(
  sessionToken: string,
  items: PatientFormDocumentItem[],
) {
  return patientBearerFetch<PatientFormDocumentsResponse>(
    '/api/v1/patient-documents/forms',
    sessionToken,
    {
      method: 'POST',
      body: JSON.stringify({ items }),
    },
  );
}

export async function fetchFormPrivacyNotice(sessionToken: string) {
  return patientBearerFetch<FormPrivacyNotice>(
    '/api/v1/patient-documents/privacy-notice',
    sessionToken,
  );
}

export async function fetchFormTemplate(
  sessionToken: string,
  templateId: string,
  version?: number,
) {
  const query = version != null ? `?version=${version}` : '';
  return patientBearerFetch<FormTemplate>(
    `/api/v1/patient-documents/form-templates/${encodeURIComponent(templateId)}${query}`,
    sessionToken,
  );
}

export async function deletePatientDocument(sessionToken: string, documentId: string) {
  return patientBearerFetch<PatientDocument>(
    `/api/v1/patient-documents/${encodeURIComponent(documentId)}/delete`,
    sessionToken,
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
  );
}
