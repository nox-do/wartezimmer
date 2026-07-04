import { loadMfaDayLifecycle, resetMfaDayOps } from '$lib/mfa/mfa-day-ops.svelte';
import {
  loadMfaPracticeContext,
  resetMfaPracticeContext,
} from '$lib/mfa/mfa-practice-context.svelte';
import { mountMfaQueueDisplay, resetMfaQueueDisplay } from '$lib/mfa/mfa-queue-display.svelte';
import { resetMfaQueueActions } from '$lib/mfa/mfa-queue-actions.svelte';

export function mountMfaDashboard(): () => void {
  resetMfaQueueDisplay();
  resetMfaPracticeContext();
  resetMfaDayOps();
  resetMfaQueueActions();

  void loadMfaPracticeContext();
  void loadMfaDayLifecycle();

  const stopQueueDisplay = mountMfaQueueDisplay();

  return () => {
    stopQueueDisplay();
    resetMfaQueueDisplay();
    resetMfaPracticeContext();
    resetMfaDayOps();
    resetMfaQueueActions();
  };
}
