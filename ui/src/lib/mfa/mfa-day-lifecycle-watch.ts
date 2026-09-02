/** Interval to notice a calendar-day change while the MFA tab stays open. */
export const MFA_DAY_LIFECYCLE_TICK_MS = 30_000;

/** Wall-clock jump that means JS was frozen (sleep / OS suspend), not a late tick. */
export const MFA_DAY_LIFECYCLE_GAP_MS = 90_000;

const RETRY_MS = 4_000;

export function localCalendarDay(nowMs: number): string {
  const date = new Date(nowMs);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function shouldReloadMfaDayLifecycle(input: {
  nowMs: number;
  lastTickMs: number;
  lastCalendarDay: string;
  gapMs?: number;
}): boolean {
  const gapMs = input.gapMs ?? MFA_DAY_LIFECYCLE_GAP_MS;
  if (input.nowMs - input.lastTickMs > gapMs) {
    return true;
  }
  return localCalendarDay(input.nowMs) !== input.lastCalendarDay;
}

export type MfaDayLifecycleWatchOptions = {
  load: () => Promise<boolean>;
  now?: () => number;
};

/**
 * Reloads MFA day-lifecycle after tab resume, network return, OS sleep
 * (overdue timer), or local midnight — without relying on window focus.
 */
export function startMfaDayLifecycleWatch(options: MfaDayLifecycleWatchOptions): () => void {
  const now = options.now ?? Date.now;
  let lastTickMs = now();
  let lastCalendarDay = localCalendarDay(lastTickMs);
  let stopped = false;
  let inflight = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryDelayMs = RETRY_MS;

  const clearRetry = () => {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const runLoad = async () => {
    if (stopped || inflight) {
      return;
    }

    inflight = true;
    const ok = await options.load().catch(() => false);
    inflight = false;

    if (stopped) {
      return;
    }

    if (ok) {
      retryDelayMs = RETRY_MS;
      return;
    }

    retryTimer = setTimeout(() => {
      retryTimer = null;
      void runLoad();
    }, retryDelayMs);
    retryDelayMs = Math.min(retryDelayMs * 2, MFA_DAY_LIFECYCLE_TICK_MS);
  };

  const requestLoad = () => {
    if (stopped) {
      return;
    }
    clearRetry();
    void runLoad();
  };

  const onVisible = () => {
    if (document.visibilityState === 'visible') {
      requestLoad();
    }
  };

  const onResumeSignal = () => {
    requestLoad();
  };

  const onTick = () => {
    const nowMs = now();
    if (
      shouldReloadMfaDayLifecycle({
        nowMs,
        lastTickMs,
        lastCalendarDay,
      })
    ) {
      requestLoad();
    }
    lastTickMs = nowMs;
    lastCalendarDay = localCalendarDay(nowMs);
  };

  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('pageshow', onResumeSignal);
  window.addEventListener('online', onResumeSignal);
  document.addEventListener('resume', onResumeSignal, true);

  const tickTimer = setInterval(onTick, MFA_DAY_LIFECYCLE_TICK_MS);
  requestLoad();

  return () => {
    stopped = true;
    clearRetry();
    clearInterval(tickTimer);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('pageshow', onResumeSignal);
    window.removeEventListener('online', onResumeSignal);
    document.removeEventListener('resume', onResumeSignal, true);
  };
}
