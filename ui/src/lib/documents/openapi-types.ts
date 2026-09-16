/**
 * UI types derived from openapi/documents.yaml (generated via `npm run generate:openapi-types`).
 * Fastify handlers use inline JSON Schema in routes — keep both in sync with OpenAPI.
 */
import type { components, paths } from '$lib/documents/generated/documents-openapi';

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

export type SessionResolveResponse =
  paths['/api/v1/portal/sessions/resolve-ticket']['post']['responses']['201']['content']['application/json'];
export type SessionMeResponse =
  paths['/api/v1/portal/sessions/me']['get']['responses']['200']['content']['application/json'];
export type CaptiveAuthorizeResponse =
  paths['/api/v1/portal/sessions/captive-authorize']['post']['responses']['200']['content']['application/json'];
