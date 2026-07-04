export function formatClockTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '–';
  }
  return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
