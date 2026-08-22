/**
 * UI types derived from openapi/checkin.yaml (generated via `npm run generate:openapi-types`).
 */
import type { components, paths } from './generated/checkin-openapi';

export type VisitCreated = components['schemas']['VisitCreated'];
export type TicketCreated = VisitCreated;
export type TerminalTopic = components['schemas']['TerminalTopic'];
export type TerminalTopicsResponse =
  paths['/api/v1/checkins/topics']['get']['responses']['200']['content']['application/json'];
export type TerminalAssistPressed = components['schemas']['TerminalAssistPressed'];
export type TerminalAuthPath =
  paths['/api/v1/checkins']['post']['requestBody']['content']['application/json']['authPath'];
