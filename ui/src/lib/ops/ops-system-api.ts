import { opsAuthFetch } from '$lib/api/staff-auth-fetch';
import { updatePracticeProfileCache } from '$lib/practice/practice-profile-client';
import type {
  ContactLookupPreviewResponse,
  ContactLookupValidateResponse,
  CsvContactDelimiterMode,
  CsvContactLookupMapping,
  DeploymentStorageResponse,
  DeploymentVolumeStatus,
  MessagingProviderCatalogResponse,
  OpsOnboardingStatus,
  OpsPatchSystemSettingsBody,
  OpsSettingsResponse,
  RoutingCapabilitiesResponse,
  PatchOpsOnboardingBody,
  RuntimeResetPreviewResponse,
  RuntimeResetResponse,
} from '$lib/ops/openapi-types';

export type {
  ContactLookupPreviewResponse as ContactLookupPreview,
  ContactLookupValidateResponse,
  CsvContactDelimiterMode,
  CsvContactLookupMapping,
  DeploymentStorageResponse as DeploymentStorageSnapshot,
  DeploymentVolumeStatus,
  MessagingProviderCatalogResponse as MessagingProviderCatalog,
  OpsOnboardingStatus,
  OpsPatchSystemSettingsBody as PatchOpsSystemSettingsBody,
  PatchOpsOnboardingBody,
  PracticeProfile,
  RuntimeResetPreviewResponse as RuntimeResetPreview,
  RuntimeResetResponse as RuntimeResetResult,
  SetupCheck,
  SetupContactMode,
  SetupPhase,
  SetupWizardStep,
} from '$lib/ops/openapi-types';

export type DeploymentCsvFile = DeploymentVolumeStatus['csvFiles'][number];
export type DeploymentImportFolder = DeploymentVolumeStatus['importFolders'][number];
export type MessagingProviderDescriptor =
  MessagingProviderCatalogResponse['channels'][number]['providers'][number];
export type ContactLookupLayout = ContactLookupPreviewResponse['layout'];

export async function fetchOpsSystemSettings() {
  return opsAuthFetch<OpsSettingsResponse>('/api/v1/ops/settings');
}

export async function fetchOpsRoutingCapabilities() {
  return opsAuthFetch<RoutingCapabilitiesResponse>('/api/v1/ops/settings/capabilities');
}

export async function patchOpsSystemSettings(body: OpsPatchSystemSettingsBody) {
  const result = await opsAuthFetch<OpsSettingsResponse>('/api/v1/ops/settings', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  if (result.ok && body.practiceProfile) {
    updatePracticeProfileCache(result.data.practiceProfile);
  }
  return result;
}

export async function fetchOpsOnboarding() {
  return opsAuthFetch<OpsOnboardingStatus>('/api/v1/ops/settings/onboarding');
}

export async function verifyOpsOnboarding() {
  return opsAuthFetch<OpsOnboardingStatus>('/api/v1/ops/settings/onboarding/verify', {
    method: 'POST',
  });
}

export async function patchOpsOnboarding(body: PatchOpsOnboardingBody) {
  return opsAuthFetch<OpsOnboardingStatus>('/api/v1/ops/settings/onboarding', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function fetchDeploymentStorage() {
  return opsAuthFetch<DeploymentStorageResponse>('/api/v1/ops/deployment/storage');
}

function contactLookupRequestBody(body: {
  contactLookupFolderPath: string;
  contactLookupDelimiterMode: CsvContactDelimiterMode;
  contactLookupHasHeader: boolean;
  contactLookupMapping: CsvContactLookupMapping;
}) {
  return body;
}

export async function previewContactLookup(body: {
  contactLookupFolderPath: string;
  contactLookupDelimiterMode: CsvContactDelimiterMode;
  contactLookupHasHeader: boolean;
  contactLookupMapping: CsvContactLookupMapping;
}) {
  return opsAuthFetch<ContactLookupPreviewResponse>('/api/v1/ops/contact-lookup/preview', {
    method: 'POST',
    body: JSON.stringify(contactLookupRequestBody(body)),
  });
}

export async function validateContactLookup(body: {
  contactLookupFolderPath: string;
  contactLookupDelimiterMode: CsvContactDelimiterMode;
  contactLookupHasHeader: boolean;
  contactLookupMapping: CsvContactLookupMapping;
}) {
  return opsAuthFetch<ContactLookupValidateResponse>('/api/v1/ops/contact-lookup/validate', {
    method: 'POST',
    body: JSON.stringify(contactLookupRequestBody(body)),
  });
}

export async function fetchMessagingCatalog() {
  return opsAuthFetch<MessagingProviderCatalogResponse>('/api/v1/ops/messaging/providers');
}

export async function fetchRuntimeResetPreview() {
  return opsAuthFetch<RuntimeResetPreviewResponse>('/api/v1/ops/maintenance/runtime-reset/preview');
}

export async function executeRuntimeReset(confirmPhrase: string) {
  return opsAuthFetch<RuntimeResetResponse>('/api/v1/ops/maintenance/runtime-reset', {
    method: 'POST',
    body: JSON.stringify({ confirmPhrase }),
  });
}

export async function patchMessagingProvider(
  providerId: string,
  body: { enabled?: boolean; credentials?: Record<string, string> },
) {
  return opsAuthFetch<MessagingProviderDescriptor>(
    `/api/v1/ops/messaging/providers/${encodeURIComponent(providerId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  );
}

export async function applyContactLookupDemo() {
  return opsAuthFetch<OpsOnboardingStatus>('/api/v1/ops/contact-lookup/apply-demo', {
    method: 'POST',
  });
}
