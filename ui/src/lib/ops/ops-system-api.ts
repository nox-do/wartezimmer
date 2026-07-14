import { opsAuthFetch } from '$lib/api/staff-auth-fetch';
import { updatePracticeProfileCache } from '$lib/practice/practice-profile-client';
import type {
  CsvContactDelimiterMode,
  CsvContactLookupMapping,
  OpsOnboardingStatus,
  OpsPatchSystemSettingsBody,
  OpsSettingsResponse,
  PatchOpsOnboardingBody,
} from '$lib/ops/openapi-types';

export type {
  CsvContactDelimiterMode,
  CsvContactLookupMapping,
  OpsOnboardingStatus,
  OpsPatchSystemSettingsBody as PatchOpsSystemSettingsBody,
  PatchOpsOnboardingBody,
  PracticeProfile,
  SetupCheck,
  SetupContactMode,
  SetupPhase,
  SetupWizardStep,
} from '$lib/ops/openapi-types';

export type DeploymentCsvFile = {
  fileName: string;
  containerPath: string;
  sizeBytes: number;
  updatedAt: string;
};

export type DeploymentImportFolder = {
  label: string;
  containerPath: string;
};

export type DeploymentVolumeStatus = {
  containerPath: string;
  userFolderLabel: string;
  ready: boolean;
  hint: string | null;
  csvFiles: DeploymentCsvFile[];
  importFolders: DeploymentImportFolder[];
};

export type DeploymentStorageSnapshot = {
  imports: DeploymentVolumeStatus;
  exports: DeploymentVolumeStatus;
  serverTime: string;
};

export type MessagingProviderDescriptor = {
  id: string;
  label: string;
  channel: 'sms' | 'messenger';
  configured: boolean;
  enabled: boolean;
  requires: string[];
};

export type MessagingProviderCatalog = {
  channels: Array<{
    id: 'sms' | 'messenger';
    providers: MessagingProviderDescriptor[];
  }>;
};

export async function fetchOpsSystemSettings() {
  return opsAuthFetch<OpsSettingsResponse>('/api/v1/ops/settings');
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
  return opsAuthFetch<DeploymentStorageSnapshot>('/api/v1/ops/deployment/storage');
}

export type ContactLookupLayout = 'list' | 'per_patient' | 'mixed';

export type ContactLookupPreview = {
  detectedDelimiterMode: Exclude<CsvContactDelimiterMode, 'auto'>;
  layout: ContactLookupLayout;
  csvFileCount: number;
  patientCount: number;
  columns: string[];
  sampleRows: string[][];
  sampleSourceFile: string;
  suggestedMapping: Partial<CsvContactLookupMapping>;
  scannedAt: string;
};

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
  return opsAuthFetch<ContactLookupPreview>('/api/v1/ops/contact-lookup/preview', {
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
  return opsAuthFetch<{
    ok: true;
    detectedDelimiterMode: Exclude<CsvContactDelimiterMode, 'auto'>;
    layout: ContactLookupLayout;
    csvFileCount: number;
    patientCount: number;
    sampleRows: number;
  }>('/api/v1/ops/contact-lookup/validate', {
    method: 'POST',
    body: JSON.stringify(contactLookupRequestBody(body)),
  });
}

export async function fetchMessagingCatalog() {
  return opsAuthFetch<MessagingProviderCatalog>('/api/v1/ops/messaging/providers');
}

export type RuntimeResetPreview = {
  ticketCount: number;
  outboxEventCount: number;
  emergencyActive: boolean;
  preservedTopicCount: number;
  preservedRoomCount: number;
  confirmPhrase: string;
  serverTime: string;
};

export type RuntimeResetResult = {
  resetTicketCount: number;
  clearedOutboxCount: number;
  emergencyCleared: boolean;
  preservedTopicCount: number;
  preservedRoomCount: number;
  checkinLocked: true;
  dayClosePhase: 'open' | 'started';
  lastResetBusinessDay: string;
  updatedAt: string;
  sandboxRestartRequired: true;
  sandboxRestartInitiated: true;
};

export async function fetchRuntimeResetPreview() {
  return opsAuthFetch<RuntimeResetPreview>('/api/v1/ops/maintenance/runtime-reset/preview');
}

export async function executeRuntimeReset(confirmPhrase: string) {
  return opsAuthFetch<RuntimeResetResult>('/api/v1/ops/maintenance/runtime-reset', {
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
