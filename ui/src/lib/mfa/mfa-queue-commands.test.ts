import { beforeEach, describe, expect, test, vi } from 'vitest';

const applyMfaQueueSnapshot = vi.fn();
const fetchMfaQueue = vi.fn();
const toastError = vi.fn();
const setAbsenceVisit = vi.fn();
const setCallbackPhoneVisit = vi.fn();
const retryRecallNotifyVisit = vi.fn();
const checkOutVisit = vi.fn();
const mfaQueueActions = {
  busyVisitId: null as string | null,
  assistancePlacementVisit: null,
  checkOutVisit: null as null | {
    visitId: string;
    laneCode: string;
    number: number;
    purpose: 'checkout' | 'cancel';
  },
  phoneCorrectionVisit: null as null | {
    visitId: string;
    laneCode: string;
    number: number;
    initialPhone: string;
    purpose: 'markAway' | 'fixRecallNotify';
  },
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
  checkOutVisit,
  cancelQueueVisit: vi.fn(),
  continueJourneyVisit: vi.fn(),
  cycleTriageVisit: vi.fn(),
  recallVisit: vi.fn(),
  retryRecallNotifyVisit,
  reassignRoomVisit: vi.fn(),
  returnVisitToWaiting: vi.fn(),
  setAbsenceVisit,
  setCallbackPhoneVisit,
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

const {
  runMfaQueueAction,
  confirmMfaCheckOut,
  confirmMfaPhoneCorrection,
  handleMfaRetryRecallNotify,
} = await import('./mfa-queue-commands.svelte');

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

describe('MFA oral recall consent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mfaQueueActions.busyVisitId = null;
    mfaQueueActions.phoneCorrectionVisit = {
      visitId: 'M-018',
      laneCode: 'M',
      number: 18,
      initialPhone: '',
      purpose: 'markAway',
    };
  });

  test('blocks entering a number without the consent checkbox', async () => {
    await confirmMfaPhoneCorrection('+4917612345678', false);
    expect(setAbsenceVisit).not.toHaveBeenCalled();
    expect(setCallbackPhoneVisit).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith('mfa.recallConsentRequired');
  });

  test('saves absence, number and consent in one API mutation', async () => {
    setAbsenceVisit.mockResolvedValue({ ok: true, data: {} });
    await confirmMfaPhoneCorrection('+4917612345678', true);
    expect(setAbsenceVisit).toHaveBeenCalledWith('M-018', 'wait_here', {
      callbackPhone: '+4917612345678',
      recallConsentConfirmed: true,
    });
    expect(setCallbackPhoneVisit).not.toHaveBeenCalled();
  });

  test('permits absence without notification or consent', async () => {
    setAbsenceVisit.mockResolvedValue({ ok: true, data: {} });
    await confirmMfaPhoneCorrection('', false);
    expect(setAbsenceVisit).toHaveBeenCalledWith('M-018', 'wait_here', {
      callbackPhone: '',
      recallConsentConfirmed: false,
    });
  });

  test('also blocks a corrected retry number without consent', async () => {
    mfaQueueActions.phoneCorrectionVisit!.purpose = 'fixRecallNotify';
    await confirmMfaPhoneCorrection('+4917612345678', false);
    expect(setCallbackPhoneVisit).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith('mfa.recallConsentRequired');
  });
});

test('direct retry reuses saved consent and number without opening a correction mutation', async () => {
  vi.clearAllMocks();
  mfaQueueActions.busyVisitId = null;
  retryRecallNotifyVisit.mockResolvedValue({
    ok: true,
    data: { smsDispatch: { sent: true, status: 'accepted' } },
  });
  fetchMfaQueue.mockResolvedValue({ ok: true, data: { revision: 8, items: [] } });
  await handleMfaRetryRecallNotify('M-018');
  expect(retryRecallNotifyVisit).toHaveBeenCalledWith('M-018');
  expect(setCallbackPhoneVisit).not.toHaveBeenCalled();
  expect(setAbsenceVisit).not.toHaveBeenCalled();
});

describe('discharge confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mfaQueueActions.busyVisitId = null;
    mfaQueueActions.checkOutVisit = {
      visitId: 'M-018',
      laneCode: 'M',
      number: 18,
      purpose: 'checkout',
    };
  });

  test('keeps the confirmation open after document deletion fails', async () => {
    checkOutVisit.mockResolvedValue({
      ok: false,
      error: { message: 'Dokumente konnten nicht gelöscht werden.' },
    });
    await confirmMfaCheckOut();
    expect(mfaQueueActions.checkOutVisit?.visitId).toBe('M-018');
    expect(toastError).toHaveBeenCalledWith('Dokumente konnten nicht gelöscht werden.');
    expect(fetchMfaQueue).not.toHaveBeenCalled();
  });

  test('closes the confirmation after successful discharge', async () => {
    checkOutVisit.mockResolvedValue({ ok: true, data: { toStatus: 'done' } });
    fetchMfaQueue.mockResolvedValue({ ok: true, data: { items: [] } });
    await confirmMfaCheckOut();
    expect(mfaQueueActions.checkOutVisit).toBeNull();
    expect(checkOutVisit).toHaveBeenCalledWith('M-018');
  });
});
