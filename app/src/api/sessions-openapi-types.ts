/**
 * Backend handler types for session routes (paths in openapi/documents.yaml).
 */
import type { paths } from './generated/documents-openapi.js';

export type ResolveTicketBody =
  paths['/api/v1/sessions/resolve-ticket']['post']['requestBody']['content']['application/json'];
export type VerifyTicketBody =
  paths['/api/v1/sessions/verify-ticket-code']['post']['requestBody']['content']['application/json'];
export type CaptiveAuthorizeBody =
  paths['/api/v1/sessions/captive-authorize']['post']['requestBody']['content']['application/json'];
