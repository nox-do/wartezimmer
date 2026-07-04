export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '–';
  }

  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60_000) {
    return 'gerade eben';
  }

  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 60) {
    return diffMinutes === 1 ? 'vor 1 Minute' : `vor ${diffMinutes} Minuten`;
  }

  return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
