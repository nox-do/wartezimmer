import type {
  Catalog,
  JourneyCompletedWhen,
  MovementMode,
  PublicDisplayMode,
  RoutingRule,
  SurfaceDisplayRule,
  Visit,
} from './types.js';
import {
  COMPLETED_WHEN_VALUES,
  ESCORT_POLICIES,
  LOCATION_CONFIDENCES,
  MOVEMENT_MODES,
  PUBLIC_DISPLAY_MODES,
  REDIRECT_LOCATION_SEMANTICS,
} from './domain-enums.js';
import { assertTopicLaneCode } from './lane-code.js';
import { ruleSpecificity } from './surface-visibility.js';
import { stepsForJourneyTemplate } from './visit-context.js';
import type { RedirectRequestBody } from './redirect-flow.js';

export function terminalScopesOverlap(
  a: string[] | null | undefined,
  b: string[] | null | undefined,
): boolean {
  const aAll = !a?.length;
  const bAll = !b?.length;
  if (aAll || bAll) return true;
  return a.some((id) => b.includes(id));
}

function assertActiveLocation(catalog: Catalog, locationId: string | null | undefined): void {
  if (!locationId) return;
  const location = catalog.locations.find((item) => item.id === locationId);
  if (!location?.active) throw new Error('LOCATION_INACTIVE_OR_MISSING');
}

function assertActiveQueue(catalog: Catalog, queueId: string | null | undefined): void {
  if (!queueId) return;
  const queue = catalog.queues.find((item) => item.id === queueId);
  if (!queue?.active) throw new Error('QUEUE_INACTIVE_OR_MISSING');
}

/** Zwei Regeln koennen dieselbe Visit treffen, wenn Queue/Topic/Location-Filter kompatibel sind. */
export function surfaceDisplayRulesOverlap(
  left: SurfaceDisplayRule,
  right: SurfaceDisplayRule,
): boolean {
  if (left.surfaceId !== right.surfaceId) return false;
  const queueOverlap = !left.queueId || !right.queueId || left.queueId === right.queueId;
  const topicOverlap = !left.topicId || !right.topicId || left.topicId === right.topicId;
  const locationOverlap =
    !left.locationId || !right.locationId || left.locationId === right.locationId;
  return queueOverlap && topicOverlap && locationOverlap;
}

export function surfaceDisplayRulesAmbiguous(
  left: SurfaceDisplayRule,
  right: SurfaceDisplayRule,
): boolean {
  if (!surfaceDisplayRulesOverlap(left, right)) return false;
  if (ruleSpecificity(left) !== ruleSpecificity(right)) return false;
  if ((left.sortOrder ?? 0) !== (right.sortOrder ?? 0)) return false;
  return left.displayMode !== right.displayMode;
}

/** Startup-Integritaet: dieselben Validatoren wie Admin-Saves wiederverwenden. */
export function validateCatalogIntegrity(catalog: Catalog): void {
  for (const topic of catalog.topics) {
    assertTopicLaneCode(topic);
  }

  if (catalog.surfaceDisplayRules.length > 0) {
    validateSurfaceDisplayRules(catalog, catalog.surfaceDisplayRules);
  }

  for (const rule of catalog.routingRules.filter((item) => item.active)) {
    validateRoutingRuleDraft(catalog, rule, { ruleId: rule.id });
  }

  for (const template of catalog.journeyTemplates) {
    const steps = stepsForJourneyTemplate(template.id, catalog.journeySteps);
    validateJourneyTemplateDraft(catalog, { ...template, steps });
  }
}

export type RoutingRuleDraft = Partial<RoutingRule> & { topicId: string };

export function validateRoutingRuleDraft(
  catalog: Catalog,
  ruleDraft: RoutingRuleDraft,
  { ruleId }: { ruleId?: string } = {},
): void {
  const topic = catalog.topics.find((item) => item.id === ruleDraft.topicId);
  if (!topic) throw new Error('TOPIC_INACTIVE_OR_MISSING');
  if (!topic.active) throw new Error('TOPIC_NOT_ACTIVE');

  if (!ruleDraft.initialMovementMode || !MOVEMENT_MODES.includes(ruleDraft.initialMovementMode)) {
    throw new Error('INVALID_MOVEMENT_MODE');
  }
  if (!LOCATION_CONFIDENCES.includes(ruleDraft.initialLocationConfidence ?? 'instructed')) {
    throw new Error('INVALID_LOCATION_CONFIDENCE');
  }
  if (!ruleDraft.publicDisplayMode || !PUBLIC_DISPLAY_MODES.includes(ruleDraft.publicDisplayMode)) {
    throw new Error('INVALID_PUBLIC_DISPLAY_MODE');
  }
  if (!ruleDraft.escortPolicy || !ESCORT_POLICIES.includes(ruleDraft.escortPolicy)) {
    throw new Error('INVALID_ESCORT_POLICY');
  }

  for (const surfaceId of ruleDraft.allowedSurfaceIds ?? []) {
    const surface = catalog.surfaces.find((item) => item.id === surfaceId);
    if (!surface || surface.type !== 'terminal' || !surface.enabled) {
      throw new Error('TERMINAL_SURFACE_INVALID');
    }
  }

  if (ruleDraft.journeyTemplateId) {
    const template = catalog.journeyTemplates.find(
      (item) => item.id === ruleDraft.journeyTemplateId,
    );
    if (!template?.active) throw new Error('JOURNEY_TEMPLATE_INACTIVE_OR_MISSING');
    if (template.topicId && template.topicId !== ruleDraft.topicId)
      throw new Error('JOURNEY_TOPIC_MISMATCH');
  } else {
    assertActiveLocation(catalog, ruleDraft.initialLastKnownLocationId);
    assertActiveLocation(catalog, ruleDraft.initialTargetLocationId);
    assertActiveQueue(catalog, ruleDraft.initialQueueId);
  }

  if (ruleDraft.active) {
    for (const other of catalog.routingRules) {
      if (other.id === ruleId) continue;
      if (!other.active || other.topicId !== ruleDraft.topicId) continue;
      if (terminalScopesOverlap(ruleDraft.allowedSurfaceIds, other.allowedSurfaceIds)) {
        throw new Error('DUPLICATE_ACTIVE_ROUTING_RULE');
      }
    }
  }
}

export type JourneyStepDraft = {
  id?: string;
  sortOrder: number;
  targetLocationId?: string | null;
  queueId?: string | null;
  movementMode: MovementMode;
  publicDisplayMode: PublicDisplayMode;
  completedWhen: JourneyCompletedWhen;
  instructionText?: string;
};

export type JourneyTemplateDraft = {
  name: string;
  topicId?: string | null;
  active: boolean;
  steps?: JourneyStepDraft[];
};

export function validateJourneyTemplateDraft(
  catalog: Catalog,
  templateDraft: JourneyTemplateDraft,
): void {
  if (!templateDraft.name?.trim()) throw new Error('INVALID_REQUEST_BODY');

  if (templateDraft.topicId) {
    const topic = catalog.topics.find((item) => item.id === templateDraft.topicId);
    if (!topic?.active) throw new Error('TOPIC_INACTIVE_OR_MISSING');
  }

  const steps = templateDraft.steps ?? [];
  if (templateDraft.active && steps.length === 0) throw new Error('JOURNEY_STEPS_EMPTY');

  const sortOrders = new Set<number>();
  const stepIds = new Set<string>();
  for (const step of steps) {
    if (!MOVEMENT_MODES.includes(step.movementMode)) throw new Error('INVALID_MOVEMENT_MODE');
    if (!COMPLETED_WHEN_VALUES.includes(step.completedWhen))
      throw new Error('INVALID_COMPLETED_WHEN');
    if (!PUBLIC_DISPLAY_MODES.includes(step.publicDisplayMode))
      throw new Error('INVALID_PUBLIC_DISPLAY_MODE');
    if (sortOrders.has(step.sortOrder)) throw new Error('DUPLICATE_JOURNEY_SORT_ORDER');
    sortOrders.add(step.sortOrder);
    if (step.id) {
      if (stepIds.has(step.id)) throw new Error('DUPLICATE_JOURNEY_STEP_ID');
      stepIds.add(step.id);
    }
    assertActiveLocation(catalog, step.targetLocationId);
    assertActiveQueue(catalog, step.queueId);
  }
}

export function validateSurfaceDisplayRules(catalog: Catalog, rules: SurfaceDisplayRule[]): void {
  const bySurface = new Map<string, SurfaceDisplayRule[]>();
  for (const rule of rules) {
    const surface = catalog.surfaces.find((item) => item.id === rule.surfaceId);
    if (!surface) throw new Error('SURFACE_NOT_FOUND');
    if (!PUBLIC_DISPLAY_MODES.includes(rule.displayMode))
      throw new Error('INVALID_PUBLIC_DISPLAY_MODE');
    if (rule.queueId) assertActiveQueue(catalog, rule.queueId);
    if (rule.locationId) assertActiveLocation(catalog, rule.locationId);
    if (rule.topicId) {
      const topic = catalog.topics.find((item) => item.id === rule.topicId);
      if (!topic?.active) throw new Error('TOPIC_INACTIVE_OR_MISSING');
    }

    const surfaceRules = bySurface.get(rule.surfaceId) ?? [];
    for (const existing of surfaceRules) {
      if (surfaceDisplayRulesAmbiguous(existing, rule)) {
        throw new Error('SURFACE_DISPLAY_RULE_AMBIGUOUS');
      }
    }
    surfaceRules.push(rule);
    bySurface.set(rule.surfaceId, surfaceRules);
  }
}

export function validateRedirectRequest(
  catalog: Catalog,
  visit: Visit,
  body: RedirectRequestBody,
): void {
  if ('targetLocationId' in body) {
    assertActiveLocation(catalog, body.targetLocationId);
  }
  if ('queueId' in body) {
    assertActiveQueue(catalog, body.queueId);
  }

  if (!MOVEMENT_MODES.includes(body.movementMode)) throw new Error('INVALID_MOVEMENT_MODE');
  if (!PUBLIC_DISPLAY_MODES.includes(body.publicDisplayMode))
    throw new Error('INVALID_PUBLIC_DISPLAY_MODE');
  if (body.locationSemantics && !REDIRECT_LOCATION_SEMANTICS.includes(body.locationSemantics)) {
    throw new Error('INVALID_REDIRECT_LOCATION_SEMANTICS');
  }
  // unknown: lastKnownLocationId weglassen = Wert bleibt; null nur mit explizitem Feld.
  if ('lastKnownLocationId' in body && body.lastKnownLocationId) {
    assertActiveLocation(catalog, body.lastKnownLocationId);
  }
  if (body.preserveTerminalInstruction && body.terminalInstruction) {
    throw new Error('REDIRECT_TERMINAL_INSTRUCTION_CONFLICT');
  }

  const actorSurfaceId = body.actorSurfaceId ?? 'mfa_dashboard';
  const surface = catalog.surfaces.find((item) => item.id === actorSurfaceId);
  if (!surface?.enabled || !surface.supportsRedirect)
    throw new Error('REDIRECT_SURFACE_NOT_ALLOWED');

  if (visit.effectiveEscortPolicy === 'required' && body.movementMode === 'self_go') {
    throw new Error('SELF_GO_BLOCKED_BY_ESCORT_POLICY');
  }
  if (!visit.allowRedirect) throw new Error('REDIRECT_NOT_ALLOWED');
}

export function validateTopicDraft(
  catalog: Catalog,
  topicDraft: { laneCode: string; active: boolean },
  { topicId }: { topicId: string },
): void {
  const existing = catalog.topics.find((item) => item.id === topicId);
  if (!existing) throw new Error('TOPIC_NOT_FOUND');
  assertTopicLaneCode({ id: topicId, laneCode: topicDraft.laneCode, active: topicDraft.active });
}
