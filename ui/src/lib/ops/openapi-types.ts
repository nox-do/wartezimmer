/**
 * UI types derived from openapi/ops.yaml (generated via `npm run generate:openapi-types`).
 * Fastify handlers use app/src/api/generated/ops.fastify-schemas.ts — generated from openapi/ops.yaml.
 */
import type { components, paths } from '$lib/ops/generated/ops-openapi';

type OpsSchemas = components['schemas'];

/** Full PATCH body for `/api/v1/ops/settings` (OpenAPI SSoT). */
export type OpsPatchSettingsBody =
  paths['/api/v1/ops/settings']['patch']['requestBody']['content']['application/json'];

/** MFA-editable subset — mirrors app `MFA_PATCH_KEYS`. */
export type MfaPatchOpsSettingsBody = Pick<
  OpsPatchSettingsBody,
  | 'returnWindowMinutes'
  | 'practiceOpenFrom'
  | 'practiceOpenTo'
  | 'topics'
  | 'journeySettings'
  | 'rooms'
  | 'emergencyEnabled'
  | 'terminalWlanPromoEnabled'
  | 'terminalAuthPhoneEnabled'
  | 'terminalAuthNameDobEnabled'
  | 'terminalAuthEgkEnabled'
  | 'terminalPatientLocales'
>;

/** Ops-editable subset — mirrors app `OPS_PATCH_KEYS`. */
export type OpsPatchSystemSettingsBody = Pick<
  OpsPatchSettingsBody,
  | 'routingMode'
  | 'contactLookupFolderPath'
  | 'contactLookupDelimiterMode'
  | 'contactLookupHasHeader'
  | 'contactLookupMapping'
  | 'smsProvider'
  | 'practiceProfile'
>;

export type PatchOpsOnboardingBody =
  paths['/api/v1/ops/settings/onboarding']['patch']['requestBody']['content']['application/json'];

export type OpsSettingsResponse = OpsSchemas['OpsSettingsResponse'];
export type OpsOnboardingStatus = OpsSchemas['OpsOnboardingStatus'];

export type SetupCheck = OpsOnboardingStatus['checks'][number];
export type SetupPhase = OpsOnboardingStatus['phase'];
export type SetupWizardStep = OpsOnboardingStatus['setupLastStep'];
export type SetupContactMode = OpsOnboardingStatus['setupContactMode'];

export type PracticeRoom = OpsSettingsResponse['rooms'][number];
export type PracticeTopicSetting = OpsSettingsResponse['topics'][number];
export type JourneySettings = OpsSettingsResponse['journeySettings'];
export type JourneyTemplateSetting = JourneySettings['templates'][number];
export type JourneyStepSetting = JourneyTemplateSetting['steps'][number];
export type CsvContactDelimiterMode = OpsSettingsResponse['contactLookupDelimiterMode'];
export type CsvContactLookupMapping = OpsSettingsResponse['contactLookupMapping'];

export type PracticeProfile = OpsSchemas['PracticeProfile'];

export type DayLifecycleResponse = OpsSchemas['DayLifecycleResponse'];
export type RoutingCapabilitiesResponse = OpsSchemas['RoutingCapabilitiesResponse'];
export type OpsStateResponse = OpsSchemas['OpsStateResponse'];
export type BusinessDayResetResponse = OpsSchemas['BusinessDayResetResponse'];
export type DeploymentStorageResponse = OpsSchemas['DeploymentStorageResponse'];
export type DeploymentVolumeStatus = OpsSchemas['DeploymentVolumeStatus'];
export type MessagingProviderCatalogResponse = OpsSchemas['MessagingProviderCatalogResponse'];
export type RuntimeResetPreviewResponse = OpsSchemas['RuntimeResetPreviewResponse'];
export type RuntimeResetResponse = OpsSchemas['RuntimeResetResponse'];
export type OpsHeartbeatResponse = OpsSchemas['OpsHeartbeatResponse'];
export type ContactLookupPreviewResponse = OpsSchemas['ContactLookupPreviewResponse'];
export type ContactLookupValidateResponse = OpsSchemas['ContactLookupValidateResponse'];
export type EmergencyRaiseResponse = OpsSchemas['EmergencyRaiseResponse'];
