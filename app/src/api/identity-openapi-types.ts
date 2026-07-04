/**
 * Backend handler types derived from openapi/identity.yaml.
 */
import type { paths } from './generated/identity-openapi.js';

export type PhoneDobLookupBody =
  paths['/api/v1/identity/phone-dob-lookup']['post']['requestBody']['content']['application/json'];

export type MfaLookupBody =
  paths['/api/v1/identity/mfa-lookup']['post']['requestBody']['content']['application/json'];
