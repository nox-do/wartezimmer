/** 24h-Betrieb: solange offene Visits auf dem Topic laufen, kein Speichern. */
export function assertTopicEditable({ openVisitCount }: { openVisitCount: number }): void {
  if (openVisitCount > 0) throw new Error('TOPIC_LOCKED');
}
