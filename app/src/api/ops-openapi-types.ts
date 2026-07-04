/**
 * Backend handler types derived from openapi/ops.yaml.
 */
import type { components, paths } from './generated/ops-openapi.js';

export type EmergencyAcknowledgeBody =
  paths['/api/v1/ops/emergency/ack']['post']['requestBody']['content']['application/json'];
export type DevicePresenceBody = components['schemas']['DevicePresenceRequest'];
export type PatchMessagingProviderBody =
  paths['/api/v1/ops/messaging/providers/{providerId}']['patch']['requestBody']['content']['application/json'];
export type ContactLookupValidateBody =
  paths['/api/v1/ops/contact-lookup/validate']['post']['requestBody']['content']['application/json'];
export type RuntimeResetBody =
  paths['/api/v1/ops/maintenance/runtime-reset']['post']['requestBody']['content']['application/json'];
export type PatchOpsOnboardingBody =
  paths['/api/v1/ops/settings/onboarding']['patch']['requestBody']['content']['application/json'];
export type PatchOpsSettingsBody =
  paths['/api/v1/ops/settings']['patch']['requestBody']['content']['application/json'];
export type CheckinLockBody =
  paths['/api/v1/ops/checkin-lock']['post']['requestBody']['content']['application/json'];
export type BusinessDayResetBody =
  paths['/api/v1/ops/day-lifecycle/reset']['post']['requestBody']['content']['application/json'];
