import { beforeEach, describe, expect, test, vi } from 'vitest';
import { get } from 'svelte/store';

const closeMfaDocumentPreview = vi.fn();
const resetMfaQueueActions = vi.fn();

vi.mock('$lib/mfa/mfa-document-preview.svelte', () => ({
  closeMfaDocumentPreview,
}));

vi.mock('$lib/mfa/mfa-queue-actions.svelte', () => ({
  resetMfaQueueActions,
}));

const { handleMfaBackendRecovered, mfaBackendRecoveryEpoch } =
  await import('./mfa-backend-recovery.svelte');

describe('handleMfaBackendRecovered', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('resets transient state and advances the route remount epoch', () => {
    const previousEpoch = get(mfaBackendRecoveryEpoch);

    handleMfaBackendRecovered();

    expect(resetMfaQueueActions).toHaveBeenCalledTimes(1);
    expect(closeMfaDocumentPreview).toHaveBeenCalledTimes(1);
    expect(get(mfaBackendRecoveryEpoch)).toBe(previousEpoch + 1);
  });
});
