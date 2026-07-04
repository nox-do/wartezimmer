/**
 * 24h-Betrieb: solange offene Visits auf dem Template laufen, kein Speichern.
 */
export function assertJourneyTemplateEditable({ openVisitCount }: { openVisitCount: number }): void {
  if (openVisitCount > 0) throw new Error('JOURNEY_TEMPLATE_LOCKED');
}
