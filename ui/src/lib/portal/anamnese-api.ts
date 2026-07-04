/** Thin re-exports for the portal anamnese route (generic APIs live in patient-document-api). */
export {
  type FormTemplate,
  type FormTemplateField,
  type FormPrivacyNotice,
  PRIVACY_CONSENT_TEMPLATE_ID,
  PRIVACY_CONSENT_TEMPLATE_VERSION,
  fetchFormPrivacyNotice as fetchAnamnesePrivacyNotice,
  fetchFormTemplate,
  submitPatientFormDocuments,
} from './patient-document-api.js';

export const DEFAULT_ANAMNESE_TEMPLATE_ID = 'allgemeinmedizin-erstanamnese';
