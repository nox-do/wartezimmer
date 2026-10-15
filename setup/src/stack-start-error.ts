/** Operator-facing explanation; never expose raw Compose output or environment values. */
export function stackStartFailureMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : '';
  const service =
    /(?:container\s+\S*\b(app|sandbox|proxy)-\d+|Compose-Service\s+(app|sandbox|proxy))\b/i.exec(
      detail,
    );
  const name = service?.[1] ?? service?.[2];
  const label =
    name === 'app'
      ? 'Die App'
      : name === 'sandbox'
        ? 'Die Sandbox'
        : name === 'proxy'
          ? 'Der Proxy'
          : 'Ein Container';
  if (/unhealthy|nicht healthy|health check exceeded timeout|timed?\s*out|timeout/i.test(detail)) {
    return `${label} wurde nicht rechtzeitig betriebsbereit. Die Gesundheitsprüfung ist fehlgeschlagen; bitte erneut versuchen. Bei wiederholtem Fehler die Setup-Logs prüfen.`;
  }
  if (/exited|Status: (?:dead|restarting)|exited with code/i.test(detail)) {
    return `${label} wurde unerwartet beendet oder startet wiederholt neu. Bitte die Setup-Logs prüfen.`;
  }
  return 'Der Containerstart oder die anschließende Prüfung ist fehlgeschlagen. Details stehen in den Setup-Logs.';
}
