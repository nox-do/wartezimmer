/**
 * Journey-spezifische Labels, Route-Previews und Routing-Hilfen (Admin, Visit-Karten).
 *
 * Teil des geplanten Journey-Exports neben journey und journey-admin.js.
 * stepsForJourneyTemplate ist absichtlich parallel zu catalog-repository.stepsForTemplate —
 * das Journey-Bundle soll ohne Server-Import nutzbar bleiben.
 */

import type { JourneyStep, Location, Queue, RoutingRule, Visit, VisitView } from './types.js';
import { movementLabels, statusLabels } from './labels.js';
import { formatStepFraction } from './journey.js';

/** Rule mit Journey: operative Route kommt ausschliesslich aus Journey-Steps, nicht aus initial_*. */
export function ruleUsesJourneyRouting(rule: Pick<RoutingRule, 'journeyTemplateId'> | null | undefined): boolean {
  return Boolean(rule?.journeyTemplateId);
}

/** Steps eines Templates — Journey-Bundle-Variante (parallel zu runtime.stepsForTemplate). */
export function stepsForJourneyTemplate(templateId: string, journeySteps: JourneyStep[]): JourneyStep[] {
  return journeySteps
    .filter((step) => step.templateId === templateId)
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

/** Wartebereich beim Check-in: Home-Location der Step-Queue. */
export function lastKnownFromJourneyStep(step: JourneyStep | null | undefined, queues: Queue[]): string | null {
  if (!step?.queueId) return null;
  const queue = queues.find((item) => item.id === step.queueId);
  return queue?.homeLocationId ?? null;
}

export function formatJourneyAdvanceNote(params: {
  previousIndex: number;
  nextIndex?: number | null;
  stepCount: number;
  fromLocationName?: string;
  toLocationName?: string;
}): string {
  const { previousIndex, nextIndex, stepCount, fromLocationName, toLocationName } = params;
  if (nextIndex == null) return 'Journey complete';

  const hop = `${formatStepFraction(previousIndex, stepCount)} → ${formatStepFraction(nextIndex, stepCount)}`;
  if (fromLocationName && toLocationName && fromLocationName !== toLocationName) {
    return `Journey advance ${hop}: ${fromLocationName} → ${toLocationName}`;
  }
  return `Journey advance ${hop}`;
}

/** Kontext-Label fuer Visit-Karten (waiting ≠ Wartezimmer). */
export function visitOperationalLabel(
  visit: Pick<
    VisitView,
    | 'status'
    | 'movementMode'
    | 'journeyTemplateId'
    | 'journeyStepIndex'
    | 'journeyStepLabel'
    | 'lastKnownLocationId'
    | 'targetLocationId'
    | 'lastKnownLocation'
    | 'targetLocation'
  >,
): string {
  const statusLabel = statusLabels[visit.status as keyof typeof statusLabels] || visit.status;
  const at = visit.lastKnownLocation?.name || visit.lastKnownLocationId || '?';
  const target = visit.targetLocation?.name || visit.targetLocationId || '?';

  if (visit.journeyTemplateId != null && visit.journeyStepIndex != null) {
    const step = visit.journeyStepLabel || String(visit.journeyStepIndex + 1);
    if (visit.status === 'waiting' && visit.movementMode === 'call') {
      return `Schritt ${step} · wartet in ${at} auf Aufruf zu ${target}`;
    }
    if (visit.status === 'waiting' && visit.movementMode === 'pickup') {
      return `Schritt ${step} · wartet in ${at} auf Abholung zu ${target}`;
    }
    if (visit.status === 'called' && visit.movementMode === 'call') {
      return `Schritt ${step} · aufgerufen: ${at} → ${target}`;
    }
    if (visit.status === 'arrived') {
      return `Schritt ${step} · angekommen in ${at}`;
    }
    if (visit.status === 'directed' && visit.movementMode === 'self_go') {
      return `Schritt ${step} · unterwegs zu ${target}`;
    }
    if (visit.status === 'in_progress') {
      return visit.journeyStepIndex != null && visit.journeyStepLabel
        ? `Schritt ${step} · in Behandlung (${at})`
        : `in Behandlung (${at})`;
    }
    return `Schritt ${step} · ${statusLabel}`;
  }

  return statusLabel;
}

export function buildJourneyRoutePreview(steps: JourneyStep[], locations: Location[], queues: Queue[] = []): string {
  if (!steps.length) return 'Keine Journey-Schritte';
  return steps
    .map((step, index) => {
      const target = locations.find((item) => item.id === step.targetLocationId)?.name || '?';
      const queue = queues.find((item) => item.id === step.queueId)?.name;
      const mode = movementLabels[step.movementMode] || step.movementMode;
      return `Schritt ${index + 1}: ${target}${queue ? ` · ${queue}` : ''} (${mode})`;
    })
    .join(' → ');
}
