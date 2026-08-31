/** @vitest-environment jsdom */

import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  MFA_DAY_LIFECYCLE_GAP_MS,
  MFA_DAY_LIFECYCLE_TICK_MS,
  localCalendarDay,
  shouldReloadMfaDayLifecycle,
  startMfaDayLifecycleWatch,
} from './mfa-day-lifecycle-watch';

describe('localCalendarDay', () => {
  test('formats the local calendar date', () => {
    expect(localCalendarDay(new Date(2026, 7, 31, 23, 50).getTime())).toBe('2026-08-31');
    expect(localCalendarDay(new Date(2026, 8, 1, 0, 5).getTime())).toBe('2026-09-01');
  });
});

describe('shouldReloadMfaDayLifecycle', () => {
  test('stays quiet for a normal tick on the same day', () => {
    const lastTickMs = new Date(2026, 7, 31, 18, 0, 0).getTime();
    expect(
      shouldReloadMfaDayLifecycle({
        nowMs: lastTickMs + MFA_DAY_LIFECYCLE_TICK_MS,
        lastTickMs,
        lastCalendarDay: '2026-08-31',
      }),
    ).toBe(false);
  });

  test('reloads after a sleep-sized wall-clock gap while still focused', () => {
    const lastTickMs = new Date(2026, 7, 31, 18, 0, 0).getTime();
    expect(
      shouldReloadMfaDayLifecycle({
        nowMs: lastTickMs + MFA_DAY_LIFECYCLE_GAP_MS + 1,
        lastTickMs,
        lastCalendarDay: '2026-08-31',
      }),
    ).toBe(true);
  });

  test('reloads at local midnight even when ticks kept firing', () => {
    const lastTickMs = new Date(2026, 7, 31, 23, 59, 50).getTime();
    expect(
      shouldReloadMfaDayLifecycle({
        nowMs: new Date(2026, 8, 1, 0, 0, 20).getTime(),
        lastTickMs,
        lastCalendarDay: '2026-08-31',
      }),
    ).toBe(true);
  });
});

describe('startMfaDayLifecycleWatch', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test('loads on start, visibility, online, and a frozen-timer gap', async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockResolvedValue(true);
    let nowMs = new Date(2026, 7, 31, 18, 0, 0).getTime();

    const stop = startMfaDayLifecycleWatch({
      load,
      now: () => nowMs,
    });

    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);

    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(2);

    window.dispatchEvent(new Event('online'));
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(3);

    nowMs += MFA_DAY_LIFECYCLE_GAP_MS + 5_000;
    await vi.advanceTimersByTimeAsync(MFA_DAY_LIFECYCLE_TICK_MS);
    expect(load).toHaveBeenCalledTimes(4);

    stop();
  });

  test('retries a failed load until the network is back', async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);

    const stop = startMfaDayLifecycleWatch({
      load,
      now: () => Date.now(),
    });

    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(4_000);
    expect(load).toHaveBeenCalledTimes(2);

    stop();
  });
});
