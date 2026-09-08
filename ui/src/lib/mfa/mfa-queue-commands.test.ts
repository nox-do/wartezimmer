import { beforeEach, describe, expect, test, vi } from 'vitest';

const applyMfaQueueSnapshot = vi.fn();
const fetchMfaQueue = vi.fn();
const toastError = vi.fn();
const mfaQueueActions = {
  busyVisitId: null as string | null,
  assistancePlacementVisit: null,
};

vi.mock('$lib/mfa/mfa-practice-context.svelte', () => ({
  mfaPracticeContext: { practiceRooms: [] },
}));

vi.mock('$lib/mfa/mfa-queue-display.svelte', () => ({
  applyMfaQueueSnapshot,
  applyMfaQueueTriageLevel: vi.fn(),
  mfaQueueDisplay: { queue: { items: [] } },
}));

vi.mock('$lib/mfa/queue-stream', () => ({ fetchMfaQueue }));

vi.mock('$lib/queue/queue-actions', () => ({
  callVisit: vi.fn(),
  checkInVisit: vi.fn(),
  checkOutVisit: vi.fn(),
  cancelQueueVisit: vi.fn(),
  continueJourneyVisit: vi.fn(),
  cycleTriageVisit: vi.fn(),
  recallVisit: vi.fn(),
  retryRecallNotifyVisit: vi.fn(),
  reassignRoomVisit: vi.fn(),
  returnVisitToWaiting: vi.fn(),
  setAbsenceVisit: vi.fn(),
  setCallbackPhoneVisit: vi.fn(),
  clearCallbackPhoneVisit: vi.fn(),
  startTreatmentVisit: vi.fn(),
}));

vi.mock('$lib/mfa/mfa-queue-modals.svelte', () => ({
  cancelMfaAssistancePlacement: vi.fn(),
  cancelMfaPhoneCorrection: vi.fn(),
  handleMfaMarkAway: vi.fn(),
  mfaQueueActions,
  openMfaAssistancePlacement: vi.fn(),
}));

vi.mock('$lib/i18n/i18nStore.svelte', () => ({
  t: (key: string) => key,
  tf: (key: string) => key,
}));

vi.mock('$lib/stores/toastStore', () => ({
  toastStore: {
    error: toastError,
    persistent: vi.fn(),
    success: vi.fn(),
  },
}));

const { runMfaQueueAction } = await import('./mfa-queue-commands.svelte');

describe('runMfaQueueAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mfaQueueActions.busyVisitId = null;
  });

  test('keeps the ticket busy until the authoritative queue snapshot is applied', async () => {
    let resolveQueue!: (value: unknown) => void;
    fetchMfaQueue.mockReturnValue(
      new Promise((resolve) => {
        resolveQueue = resolve;
      }),
    );

    const pending = runMfaQueueAction('M-018', async () => ({
      ok: true as const,
      data: { visitId: 'M-018' },
    }));

    await vi.waitFor(() => expect(fetchMfaQueue).toHaveBeenCalledTimes(1));
    expect(mfaQueueActions.busyVisitId).toBe('M-018');

    const snapshot = { revision: 7, items: [] };
    resolveQueue({ ok: true, data: snapshot });
    await pending;

    expect(applyMfaQueueSnapshot).toHaveBeenCalledWith(snapshot);
    expect(mfaQueueActions.busyVisitId).toBeNull();
    expect(toastError).not.toHaveBeenCalled();
  });

  test('reports a rejected transition without refreshing the queue', async () => {
    await runMfaQueueAction('M-018', async () => ({
      ok: false as const,
      error: { message: 'INVALID_TRANSITION' },
    }));

    expect(fetchMfaQueue).not.toHaveBeenCalled();
    expect(applyMfaQueueSnapshot).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith('INVALID_TRANSITION');
    expect(mfaQueueActions.busyVisitId).toBeNull();
  });
});
