/**
 * UI types derived from openapi/documents.yaml (generated via `npm run generate:openapi-types`).
 * Fastify handlers use inline JSON Schema in routes — keep both in sync with OpenAPI.
 */
import type { components } from '$lib/documents/generated/documents-openapi';

type DocumentSchemas = components['schemas'];

export type PatientDocument = DocumentSchemas['PatientDocument'];
export type MfaDocument = DocumentSchemas['MfaDocument'];
export type MfaDocumentListResponse = DocumentSchemas['MfaDocumentListResponse'];
export type MfaDocumentPreview = DocumentSchemas['MfaDocumentPreview'];
export type PatientDocumentListResponse = DocumentSchemas['PatientDocumentListResponse'];
export type PatientFormDocumentsResponse = DocumentSchemas['PatientFormDocumentsResponse'];
export type FormTemplate = DocumentSchemas['FormTemplate'];
export type FormTemplateDescriptor = DocumentSchemas['FormTemplateDescriptor'];
export type FormTemplateField = DocumentSchemas['FormTemplateField'];
export type FormTemplateSection = DocumentSchemas['FormTemplateSection'];
export type FormPrivacyNotice = DocumentSchemas['FormPrivacyNotice'];
export type PatientFormDocumentItem = DocumentSchemas['PatientFormDocumentItem'];
