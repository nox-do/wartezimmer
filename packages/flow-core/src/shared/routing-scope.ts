/**
 * Terminal-Scope fuer RoutingRules: welche Terminals ein Topic/Rule anbieten duerfen.
 * null / leer = alle Terminals.
 */

import type { Catalog, RoutingRule, Surface } from './types.js';
import { MFA_ASSIST_TOPIC_ID } from './check-in-path.js';

export function isRuleAllowedAtSurface(rule: Pick<RoutingRule, 'allowedSurfaceIds'>, surfaceId: string): boolean {
  const ids = rule.allowedSurfaceIds;
  if (!ids?.length) return true;
  return ids.includes(surfaceId);
}

/** Erste aktive Rule fuer Topic, die am Surface erlaubt ist (disjunkte Terminal-Scopes). */
export function ruleForTopicAtSurface(
  catalog: Catalog,
  topicId: string,
  surfaceId: string,
): RoutingRule | undefined {
  return catalog.routingRules.find(
    (rule) => rule.topicId === topicId && rule.active && isRuleAllowedAtSurface(rule, surfaceId),
  );
}

export function topicsForTerminal(catalog: Catalog, surfaceId: string) {
  return catalog.topics.filter((topic) => {
    // Hilfe-Button: mfaAssist am Check-in, nicht in Terminal-Themenliste.
    if (topic.id === MFA_ASSIST_TOPIC_ID) return false;
    if (!topic.active) return false;
    return Boolean(ruleForTopicAtSurface(catalog, topic.id, surfaceId));
  });
}

export function terminalsForTopic(catalog: Catalog, topicId: string): Surface[] {
  const terminals = catalog.surfaces.filter((surface) => surface.type === 'terminal' && surface.enabled);
  if (!topicId) return [];
  const rules = catalog.routingRules.filter((item) => item.topicId === topicId && item.active);
  if (!rules.length) return [];
  if (rules.some((rule) => !rule.allowedSurfaceIds?.length)) return terminals;
  const allowedSurfaceIds = new Set(rules.flatMap((rule) => rule.allowedSurfaceIds ?? []));
  return terminals.filter((terminal) => allowedSurfaceIds.has(terminal.id));
}

export function formatAllowedSurfaceIds(allowedSurfaceIds: string[] | null | undefined, terminals: Surface[]): string {
  if (!allowedSurfaceIds?.length) return 'alle Terminals';
  return allowedSurfaceIds
    .map((id) => {
      const terminal = terminals.find((item) => item.id === id);
      return terminal ? `${id} · ${terminal.name}` : id;
    })
    .join(', ');
}
