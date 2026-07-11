/**
 * Sichtbarkeit eines Visits auf einer Surface.
 *
 * - SurfaceDisplayRule: gilt fuer alle Surface-Typen (Queue/Location/Topic-Match).
 * - Visit.publicDisplayMode: nur fuer type public_display (z. B. Wartezimmer-TV).
 *   Staff-Panels ignorieren publicDisplayMode — dort entscheiden nur SurfaceDisplayRules.
 *
 * Konfliktaufloesung bei mehreren passenden Regeln:
 * 1. Spezifischer schlaegt allgemein (topic+queue+location > queue-only)
 * 2. Niedrigeres sortOrder gewinnt bei gleicher Spezifitaet
 * 3. hidden schlaegt visible/call_only auf gleicher Spezifitaets-Stufe (Datenschutz)
 */

import type { PublicDisplayMode, Surface, SurfaceDisplayRule, Visit } from './types.js';

export function allowsByDisplayMode(displayMode: PublicDisplayMode, visit: Pick<Visit, 'status'>): boolean {
  if (displayMode === 'hidden') return false;
  if (displayMode === 'call_only') return visit.status === 'called';
  return true;
}

/** TV wayfinding: self_go underwegs or pickup waiting for escort. */
export function isPublicWayfindingVisit(
  visit: Pick<Visit, 'status' | 'movementMode'>,
): boolean {
  if (visit.status === 'directed') return true;
  return visit.status === 'waiting' && visit.movementMode === 'pickup';
}

export function ruleSpecificity(rule: SurfaceDisplayRule): number {
  let score = 0;
  if (rule.topicId) score += 4;
  if (rule.queueId) score += 2;
  if (rule.locationId) score += 1;
  return score;
}

export function ruleMatchesVisit(rule: SurfaceDisplayRule, visit: Visit): boolean {
  const queueMatches = !rule.queueId || rule.queueId === visit.queueId;
  const locationMatches =
    !rule.locationId ||
    rule.locationId === visit.targetLocationId ||
    rule.locationId === visit.lastKnownLocationId;
  const topicMatches = !rule.topicId || rule.topicId === visit.primaryTopicId;
  return queueMatches && locationMatches && topicMatches;
}

export function compareSurfaceDisplayRules(a: SurfaceDisplayRule, b: SurfaceDisplayRule): number {
  const specDiff = ruleSpecificity(b) - ruleSpecificity(a);
  if (specDiff !== 0) return specDiff;
  const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  if (orderDiff !== 0) return orderDiff;
  return String(a.id).localeCompare(String(b.id));
}

export function resolveSurfaceDisplayRule(matchingRules: SurfaceDisplayRule[]): SurfaceDisplayRule | undefined {
  if (!matchingRules.length) return undefined;

  const sorted = [...matchingRules].sort(compareSurfaceDisplayRules);
  const topSpecificity = ruleSpecificity(sorted[0]);
  const topTier = sorted.filter((rule) => ruleSpecificity(rule) === topSpecificity);
  const hidden = topTier.find((rule) => rule.displayMode === 'hidden');
  if (hidden) return hidden;
  return topTier[0];
}

export function matchingSurfaceDisplayRules(visit: Visit, rulesForSurface: SurfaceDisplayRule[]): SurfaceDisplayRule[] {
  return rulesForSurface.filter((rule) => ruleMatchesVisit(rule, visit));
}

export function isPatientAtSurfaceLocation(visit: Pick<Visit, 'lastKnownLocationId'>, surface: Surface): boolean {
  return visit.lastKnownLocationId === surface.locationId;
}

export type VisibilityExplanation = {
  visible: boolean;
  rule?: SurfaceDisplayRule;
  reason: string;
  matchingRuleIds: string[];
};

export function explainVisibility(
  visit: Visit,
  surface: Surface | null | undefined,
  rulesForSurface: SurfaceDisplayRule[],
): VisibilityExplanation {
  if (!surface) {
    return { visible: false, reason: 'Surface unbekannt', matchingRuleIds: [] };
  }

  const matching = matchingSurfaceDisplayRules(visit, rulesForSurface);
  const matchingRuleIds = matching.map((rule) => rule.id);
  const rule = resolveSurfaceDisplayRule(matching);

  if (!rule) {
    // directed/self_go or pickup: visit.publicDisplayMode alone can put the ticket on TV
    // ("Bitte weiter zu" / "Sie werden abgeholt") even without a queue-scoped SurfaceDisplayRule.
    if (
      surface.type === 'public_display' &&
      isPublicWayfindingVisit(visit) &&
      allowsByDisplayMode(visit.publicDisplayMode, visit)
    ) {
      return {
        visible: true,
        reason: 'Sichtbar wegen visit.publicDisplayMode (Wayfinding)',
        matchingRuleIds,
      };
    }
    return {
      visible: false,
      reason: 'Keine passende SurfaceDisplayRule',
      matchingRuleIds,
    };
  }

  if (!allowsByDisplayMode(rule.displayMode, visit)) {
    return {
      visible: false,
      rule,
      reason: `Versteckt wegen Regel ${rule.id} (displayMode=${rule.displayMode})`,
      matchingRuleIds,
    };
  }

  if (surface.type === 'public_display') {
    if (isPublicWayfindingVisit(visit)) {
      if (!allowsByDisplayMode(visit.publicDisplayMode, visit)) {
        return {
          visible: false,
          rule,
          reason: `visit.publicDisplayMode=${visit.publicDisplayMode}`,
          matchingRuleIds,
        };
      }
      return {
        visible: true,
        rule,
        reason: `Sichtbar wegen Regel ${rule.id} (Wayfinding)`,
        matchingRuleIds,
      };
    }
    if (!isPatientAtSurfaceLocation(visit, surface)) {
      return {
        visible: false,
        rule,
        reason: `Nicht am Wartezimmer (${surface.locationId})`,
        matchingRuleIds,
      };
    }
    if (!allowsByDisplayMode(visit.publicDisplayMode, visit)) {
      return {
        visible: false,
        rule,
        reason: `visit.publicDisplayMode=${visit.publicDisplayMode}`,
        matchingRuleIds,
      };
    }
  }

  return {
    visible: true,
    rule,
    reason: `Sichtbar wegen Regel ${rule.id}`,
    matchingRuleIds,
  };
}

export function isVisitVisibleOnSurface(
  visit: Visit,
  surface: Surface,
  rulesForSurface: SurfaceDisplayRule[],
): boolean {
  return explainVisibility(visit, surface, rulesForSurface).visible;
}
