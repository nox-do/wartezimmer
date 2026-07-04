import type { Queue } from '@praxis-flow/flow-core';

/**
 * Queue-/Surface-Logik beim Ortswechsel.
 *
 * Guardrails:
 * - Queue-Wechsel nur bei Ankunft, nicht bei Aufruf (Patient kann noch im Wartezimmer stehen).
 * - Kein Wechsel, wenn die aktuelle Queue bereits zur Ziel-Location passt (homeLocationId).
 * - Wechsel nur zu einer Queue mit homeLocationId = targetLocationId.
 * - Keine Ziel-Queue gefunden → Queue bleibt (z.B. Raum 1 ohne eigene Queue).
 * - Redirect setzt Queue explizit; Ankunft danach folgt denselben Regeln.
 * - Public-Display (Wartezimmer-TV): nur Visits mit lastKnownLocationId = Surface-Standort.
 */

export function queueForLocation(locationId: string | null | undefined, queues: Queue[]): Queue | undefined {
  if (!locationId) return undefined;
  return queues.find((queue) => queue.active && queue.homeLocationId === locationId);
}

export function resolveQueueOnArrival(
  currentQueueId: string | undefined,
  targetLocationId: string | null | undefined,
  queues: Queue[],
): string | undefined {
  if (!targetLocationId) return currentQueueId ?? undefined;

  const currentQueue = queues.find((queue) => queue.id === currentQueueId);
  if (currentQueue?.homeLocationId === targetLocationId) {
    return currentQueueId;
  }

  const destinationQueue = queueForLocation(targetLocationId, queues);
  return destinationQueue?.id ?? currentQueueId ?? undefined;
}
