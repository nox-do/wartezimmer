/**
 * Backend handler types derived from openapi/checkin.yaml.
 */
import type { components, paths } from './generated/checkin-openapi.js';

export type VisitCreated = components['schemas']['VisitCreated'];
export type CreateCheckinBody =
  paths['/api/v1/checkins']['post']['requestBody']['content']['application/json'];
