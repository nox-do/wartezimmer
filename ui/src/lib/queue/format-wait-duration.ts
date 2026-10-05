import { t, tf } from '$lib/i18n/i18nStore.svelte';

/** Default for older settings responses; live MFA presentation uses the saved preference. */
export const LONG_WAIT_THRESHOLD_MINUTES = 25;

export function formatWaitDuration(waitMs: number): string {
  const minutes = Math.max(0, Math.floor(waitMs / 60_000));
  if (minutes < 1) {
    return t('mfa.timeLessThanMinute');
  }
  return tf('mfa.timeMinutes', { minutes });
}

export function computeWaitMs(arrivedAt: string, nowMs = Date.now()): number {
  const createdMs = Date.parse(arrivedAt);
  return Number.isNaN(createdMs) ? 0 : Math.max(0, nowMs - createdMs);
}

export function isLongWait(
  waitMs: number,
  thresholdMinutes = LONG_WAIT_THRESHOLD_MINUTES,
): boolean {
  return waitMs >= thresholdMinutes * 60_000;
}
