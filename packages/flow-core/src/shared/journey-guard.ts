/**
 * 24h-Betrieb: solange Visits mit journeyState=active auf dem Template laufen, kein Speichern.
 * Abandoned/completed (auch bei noch offenem Visit-Status) zählen nicht.
 */
export function assertJourneyTemplateEditable({
  openVisitCount,
}: {
  openVisitCount: number;
}): void {
  if (openVisitCount > 0) throw new Error('JOURNEY_TEMPLATE_LOCKED');
}
