import { tf } from '$lib/i18n/i18nStore.svelte';

export function returnCountdownRemainingMs(returnUntil: string, nowMs = Date.now()): number {
  const deadline = Date.parse(returnUntil);
  if (Number.isNaN(deadline)) {
    return 0;
  }
  return Math.max(0, deadline - nowMs);
}

export function formatReturnCountdown(remainingMs: number): string {
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const restMinutes = minutes % 60;
    return tf('mfa.timeHoursMinutes', {
      hours,
      minutes: String(restMinutes).padStart(2, '0'),
    });
  }

  if (minutes > 0) {
    return tf('mfa.timeMinutesSeconds', {
      minutes,
      seconds: String(seconds).padStart(2, '0'),
    });
  }

  return tf('mfa.timeSeconds', { seconds });
}
