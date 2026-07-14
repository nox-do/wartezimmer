import { writable } from 'svelte/store';
import { closeMfaDocumentPreview } from '$lib/mfa/mfa-document-preview.svelte';
import { resetMfaQueueActions } from '$lib/mfa/mfa-queue-actions.svelte';

export const mfaBackendRecoveryEpoch = writable(0);

/** Remount and resync the active MFA route after the backend becomes reachable again. */
export function handleMfaBackendRecovered(): void {
  resetMfaQueueActions();
  closeMfaDocumentPreview();
  mfaBackendRecoveryEpoch.update((epoch) => epoch + 1);
}
