import { fetchMfaQueue } from '$lib/mfa/queue-stream';
import {
  fetchDayLifecycle,
  setCheckinLock,
  resetBusinessDay,
  type DayLifecycleState,
} from '$lib/mfa/practice-ops-api';
import { applyMfaQueueSnapshot, mfaQueueDisplay } from '$lib/mfa/mfa-queue-display.svelte';
import { t, tf } from '$lib/i18n/i18nStore.svelte';
import { toastStore } from '$lib/stores/toastStore';
import { broadcastMfaRuntimeReset } from '$lib/mfa/mfa-practice-context.svelte';

export const mfaDayOps = $state({
  dayLifecycle: null as DayLifecycleState | null,
  terminalLockBusy: false,
  dayStartBusy: false,
  dayStartConfirmOpen: false,
});

export function resetMfaDayOps() {
  mfaDayOps.dayLifecycle = null;
  mfaDayOps.terminalLockBusy = false;
  mfaDayOps.dayStartBusy = false;
  mfaDayOps.dayStartConfirmOpen = false;
}

export async function loadMfaDayLifecycle(): Promise<boolean> {
  const result = await fetchDayLifecycle();
  if (result.ok) {
    mfaDayOps.dayLifecycle = result.data;
    return true;
  }
  return false;
}

export function openMfaDayStartConfirm() {
  mfaDayOps.dayStartConfirmOpen = true;
}

export async function confirmMfaDayStart() {
  mfaDayOps.dayStartBusy = true;
  try {
    const result = await resetBusinessDay();
    if (!result.ok) {
      toastStore.error(result.error.message);
      return;
    }

    mfaDayOps.dayStartConfirmOpen = false;
    broadcastMfaRuntimeReset();

    if (mfaDayOps.dayLifecycle) {
      mfaDayOps.dayLifecycle = {
        ...mfaDayOps.dayLifecycle,
        lastResetBusinessDay: result.data.lastResetBusinessDay,
        needsDayStartHint: false,
        checkinLocked: true,
        dayClosePhase: result.data.dayClosePhase,
        lastDayStats: null,
      };
    }

    const queueResult = await fetchMfaQueue();
    if (queueResult.ok) {
      applyMfaQueueSnapshot(queueResult.data);
    } else if (mfaQueueDisplay.queue) {
      mfaQueueDisplay.queue = {
        ...mfaQueueDisplay.queue,
        items: [],
        checkinLocked: true,
      };
    }

    toastStore.success(
      tf('mfa.settings.dayStartSuccess', { count: String(result.data.resetVisitCount) }),
    );

    if (result.data.sandboxRestartInitiated) {
      toastStore.info(t('mfa.settings.dayStartSandboxHint'));
    }

    await loadMfaDayLifecycle();
  } finally {
    mfaDayOps.dayStartBusy = false;
  }
}

export async function handleMfaTerminalLockToggle(nextLocked: boolean) {
  if (!nextLocked && (mfaDayOps.dayLifecycle?.needsDayStartHint ?? false)) {
    toastStore.error(t('mfa.settings.terminalLockBlockedByDayReset'));
    return;
  }

  mfaDayOps.terminalLockBusy = true;
  const result = await setCheckinLock(nextLocked);
  mfaDayOps.terminalLockBusy = false;

  if (!result.ok) {
    toastStore.error(result.error.message);
    return;
  }

  if (mfaQueueDisplay.queue) {
    mfaQueueDisplay.queue = { ...mfaQueueDisplay.queue, checkinLocked: result.data.checkinLocked };
  }
  if (mfaDayOps.dayLifecycle) {
    mfaDayOps.dayLifecycle = {
      ...mfaDayOps.dayLifecycle,
      checkinLocked: result.data.checkinLocked,
      dayClosePhase: result.data.dayClosePhase,
    };
  }

  toastStore.success(
    result.data.checkinLocked
      ? t('mfa.settings.terminalLockedToast')
      : t('mfa.settings.terminalUnlockedToast'),
  );
}
