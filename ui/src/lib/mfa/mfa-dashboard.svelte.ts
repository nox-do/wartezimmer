import { loadMfaDayLifecycle, resetMfaDayOps } from '$lib/mfa/mfa-day-ops.svelte';
import {
  loadMfaPracticeContext,
  resetMfaPracticeContext,
} from '$lib/mfa/mfa-practice-context.svelte';
import { resetMfaQueueActions } from '$lib/mfa/mfa-queue-actions.svelte';

export function mountMfaDashboard(): () => void {
  resetMfaPracticeContext();
  resetMfaDayOps();
  resetMfaQueueActions();

  void loadMfaPracticeContext();
  void loadMfaDayLifecycle();

  return () => {
    resetMfaQueueActions();
  };
}
