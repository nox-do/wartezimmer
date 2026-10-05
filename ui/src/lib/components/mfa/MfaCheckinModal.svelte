<script lang="ts">
  import FormField from '$lib/components/forms/FormField.svelte';
  import { UserPlus } from '@lucide/svelte';
  import { formatTicketCode } from '@praxis-flow/domain';
  import Modal from '$lib/components/Modal.svelte';
  import Button from '$lib/components/forms/Button.svelte';
  import {
    loadPracticeProfile,
    practiceDisplayLabel,
  } from '$lib/practice/practice-profile-client';
  import {
    createMfaCheckin,
    fetchMfaCheckinTopics,
    lookupMfaIdentityCandidates,
    type MfaLookupCandidate,
  } from '$lib/mfa/mfa-checkin-api';
  import { manualMfaIdentityRef } from '$lib/mfa/mfa-checkin-identity';
  import { resolveReceiptTopicLabel } from '$lib/terminal/terminal-receipt-topic-label';
  import { requestTerminalReceiptPrint } from '$lib/terminal/terminal-receipt-print.svelte';
  import { t, tf } from '$lib/i18n/i18nStore.svelte';
  import { toastStore } from '$lib/stores/toastStore';

  interface Props {
    open?: boolean;
    onClose?: () => void;
  }

  let { open = false, onClose }: Props = $props();

  let topics = $state<{ topicId: string; label: string }[]>([]);
  let topicsLoading = $state(false);
  let topicsLoadRunId = 0;

  let submitBusy = $state(false);
  let lookupBusy = $state(false);
  let lookupError = $state('');
  let candidates = $state<MfaLookupCandidate[]>([]);
  let selectedCandidateKey = $state('');

  let topicId = $state('');
  let lookupQuery = $state('');
  let birthDate = $state('');
  const MIN_PHONE_LOOKUP_DIGITS = 3;
  const MIN_NAME_LOOKUP_CHARS = 3;

  const lookupQueryTrimmed = $derived(lookupQuery.trim());
  const birthDateTrimmed = $derived(birthDate.trim());
  const isPhoneLikeQuery = $derived(
    lookupQueryTrimmed.length > 0 &&
      !/[A-Za-z]/.test(lookupQueryTrimmed) &&
      /[\d]/.test(lookupQueryTrimmed),
  );
  const lookupDigits = $derived(lookupQueryTrimmed.replace(/\D/g, ''));
  const hasLookupInput = $derived(
    isPhoneLikeQuery
      ? lookupDigits.length >= MIN_PHONE_LOOKUP_DIGITS
      : lookupQueryTrimmed.length >= MIN_NAME_LOOKUP_CHARS,
  );
  const birthDateOnly = $derived(
    birthDateTrimmed.length > 0 && lookupQueryTrimmed.length === 0,
  );
  const selectedCandidate = $derived(
    candidates.find((candidate) => candidateKey(candidate) === selectedCandidateKey) ?? null,
  );
  const selectedTopic = $derived(topics.find((topic) => topic.topicId === topicId) ?? null);
  const phoneLookupNeedsSelection = $derived(
    isPhoneLikeQuery && lookupQueryTrimmed.length > 0 && selectedCandidate == null,
  );
  const submitDisabled = $derived(
    !topicId || submitBusy || lookupBusy || phoneLookupNeedsSelection,
  );
  let lookupRunId = 0;

  function resetForm() {
    lookupQuery = '';
    birthDate = '';
    lookupError = '';
    lookupBusy = false;
    candidates = [];
    selectedCandidateKey = '';
  }

  async function loadTopicsForOpenModal() {
    const runId = ++topicsLoadRunId;
    topicsLoading = true;
    topics = [];
    topicId = '';
    const result = await fetchMfaCheckinTopics();
    if (runId !== topicsLoadRunId) {
      return;
    }
    topicsLoading = false;
    if (!result.ok) {
      toastStore.error(result.error.message || t('mfa.checkinTopicLoadError'));
      return;
    }
    topics = result.data.topics.map((topic) => ({ topicId: topic.topicId, label: topic.label }));
    topicId = topics[0]?.topicId ?? '';
  }

  function candidateLabel(candidate: MfaLookupCandidate): string {
    const first = candidate.firstName?.trim() ?? '';
    const last = candidate.lastName?.trim() ?? '';
    const full = `${first} ${last}`.trim();
    return full || candidate.identityRef;
  }

  function candidateKey(candidate: MfaLookupCandidate): string {
    return JSON.stringify([
      candidate.identityRef,
      candidate.birthDate ?? '',
      candidate.phoneNumberExact ?? candidate.phoneNumberMasked ?? '',
    ]);
  }

  function candidateMeta(candidate: MfaLookupCandidate): string {
    const phone =
      candidate.phoneNumberExact?.trim() ??
      candidate.phoneNumberMasked?.trim() ??
      '';
    const parts = [candidate.birthDate?.trim() ?? '', phone].filter((part) => part.length > 0);
    return parts.length > 0 ? parts.join(' · ') : t('mfa.checkinLookupMetaFallback');
  }

  async function runLookup() {
    const currentRun = ++lookupRunId;
    lookupError = '';

    if (birthDateOnly) {
      candidates = [];
      selectedCandidateKey = '';
      lookupBusy = false;
      return;
    }
    if (!hasLookupInput) {
      candidates = [];
      selectedCandidateKey = '';
      lookupBusy = false;
      return;
    }

    lookupBusy = true;
    const result = await lookupMfaIdentityCandidates({
      name: !isPhoneLikeQuery ? lookupQueryTrimmed || undefined : undefined,
      birthDate: birthDateTrimmed || undefined,
      phoneNumber: isPhoneLikeQuery ? lookupQueryTrimmed || undefined : undefined,
      limit: 8,
    });
    if (currentRun !== lookupRunId) {
      return;
    }
    lookupBusy = false;
    if (!result.ok) {
      lookupError = result.error.message || t('mfa.checkinLookupError');
      candidates = [];
      selectedCandidateKey = '';
      return;
    }
    candidates = result.data.candidates;
    if (candidates.length === 1) {
      selectedCandidateKey = candidateKey(candidates[0]!);
      return;
    }
    if (!candidates.some((candidate) => candidateKey(candidate) === selectedCandidateKey)) {
      selectedCandidateKey = '';
    }
  }

  function closeModal() {
    onClose?.();
    resetForm();
  }

  function formatReceiptTimestamp(): string {
    return new Date().toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  async function printCreatedTicket(result: {
    visitId: string;
    laneCode: string;
    number: number;
    destinationRoomLabel?: string | null;
  }) {
    const profile = await loadPracticeProfile();
    requestTerminalReceiptPrint({
      practiceName: practiceDisplayLabel(profile, t('terminal.practiceFallback')),
      ticketCode: formatTicketCode(result.laneCode, result.number),
      topicLabel: resolveReceiptTopicLabel(
        {
          authPath: 'none',
          topicId,
          topicLabel: selectedTopic?.label,
        },
        t('terminal.receiptTopicEmpfang'),
      ),
      destinationRoomLabel: result.destinationRoomLabel ?? null,
      printedAtLabel: formatReceiptTimestamp(),
      kind: 'ticket',
      visitId: result.visitId,
    });
  }

  async function submit(event: Event, printReceipt = false) {
    event.preventDefault();
    if (!topicId || submitBusy) {
      return;
    }
    submitBusy = true;
    const identityRef =
      selectedCandidate?.identityRef ?? manualMfaIdentityRef(lookupQueryTrimmed);
    const result = await createMfaCheckin({ topicId, identityRef });
    if (!result.ok) {
      submitBusy = false;
      toastStore.error(result.error.message || t('mfa.checkinCreateError'));
      return;
    }
    if (printReceipt) {
      await printCreatedTicket(result.data);
    }
    submitBusy = false;
    toastStore.success(
      tf(printReceipt ? 'mfa.checkinCreatedWithReceipt' : 'mfa.checkinCreated', {
        ticket: formatTicketCode(result.data.laneCode, result.data.number),
      }),
    );
    closeModal();
  }

  $effect(() => {
    if (!open) {
      topicsLoadRunId += 1;
      topicsLoading = false;
      lookupRunId += 1;
      return;
    }

    // Check-in eligibility (practice open / topic windows) stays on the server —
    // always load the picker list from `/api/v1/checkins/topics`.
    void loadTopicsForOpenModal();
  });

  $effect(() => {
    if (!open) {
      return;
    }
    const lookupDeps = `${lookupQueryTrimmed}|${birthDateTrimmed}|${lookupDigits}`;
    void lookupDeps;
    lookupRunId += 1;
    lookupError = '';
    candidates = [];
    selectedCandidateKey = '';
    if (birthDateOnly || !hasLookupInput) {
      lookupBusy = false;
      return;
    }
    lookupBusy = true;
    const timer = setTimeout(() => {
      void runLookup();
    }, 240);
    return () => clearTimeout(timer);
  });
</script>

<Modal
  {open}
  dimBackdrop={true}
  maxWidth="560px"
  headerClass="modal-header--hero bg-gradient-primary"
  closeOnEscape={!submitBusy}
  onClose={closeModal}
>
  {#snippet header()}
    <div class="modal-header__left">
      <div class="modal-header__icon">
        <UserPlus size={18} aria-hidden="true" />
      </div>
      <div class="modal-header__texts">
        <h2 id="modal-title" class="modal-title">{t('mfa.checkinModalTitle')}</h2>
      </div>
    </div>
  {/snippet}

  <form class="modal-form" onsubmit={(event) => submit(event)}>
    <p class="modal-subtitle">{t('mfa.checkinModalDesc')}</p>

    <FormField label={t('mfa.checkinTopicLabel')}>
      {#snippet children(field)}
        <select {...field} class="form-select" bind:value={topicId} disabled={topicsLoading || submitBusy}>
          {#if topics.length === 0}
            <option value="">{t('mfa.checkinTopicPlaceholder')}</option>
          {:else}
            {#each topics as topic (topic.topicId)}
              <option value={topic.topicId}>{topic.label}</option>
            {/each}
          {/if}
        </select>
      {/snippet}
    </FormField>

    <FormField label={t('mfa.checkinLookupLabel')}>
      {#snippet children(field)}
        <input
          {...field}
          class="form-input"
          type="text"
          inputmode="text"
          autocomplete="off"
          placeholder={t('mfa.checkinLookupPlaceholder')}
          bind:value={lookupQuery}
          disabled={submitBusy}
        />
      {/snippet}
    </FormField>
    <FormField label={t('mfa.checkinBirthDateLabel')}>
      {#snippet children(field)}
        <input
          {...field}
          class="form-input"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          placeholder={t('mfa.checkinBirthDatePlaceholder')}
          bind:value={birthDate}
          disabled={submitBusy}
        />
      {/snippet}
    </FormField>
    <p class="text-desc mfa-checkin-hint">{t('mfa.checkinPhoneHint')}</p>

    {#if birthDateOnly}
      <p class="text-desc mfa-checkin-hint">{t('mfa.checkinBirthDateOnlyHint')}</p>
    {/if}

    {#if lookupBusy}
      <p class="text-desc mfa-checkin-hint">{t('mfa.checkinLookupLoading')}</p>
    {:else if lookupError}
      <p class="text-desc mfa-checkin-hint">{lookupError}</p>
    {:else if candidates.length > 0}
      <fieldset class="mfa-checkin-candidates" disabled={submitBusy}>
        <legend>{t('mfa.checkinLookupCandidates')}</legend>
        {#each candidates as candidate (candidateKey(candidate))}
          <label class="mfa-checkin-candidate">
            <input
              type="radio"
              name="mfa-checkin-candidate"
              value={candidateKey(candidate)}
              checked={selectedCandidateKey === candidateKey(candidate)}
              onchange={() => {
                selectedCandidateKey = candidateKey(candidate);
              }}
            />
            <span class="mfa-checkin-candidate__texts">
              <strong>{candidateLabel(candidate)}</strong>
              <span>{candidateMeta(candidate)}</span>
            </span>
          </label>
        {/each}
      </fieldset>
    {:else if hasLookupInput}
      <p class="text-desc mfa-checkin-hint">{t('mfa.checkinLookupNoMatch')}</p>
    {/if}

    {#if phoneLookupNeedsSelection && !lookupBusy}
      <p class="text-desc mfa-checkin-hint" role="alert">
        {t('mfa.checkinPhoneNeedsSelection')}
      </p>
    {/if}

    <div class="form-actions">
      <Button type="button" variant="outline" disabled={submitBusy} onclick={closeModal}>
        {t('ui.cancel')}
      </Button>
      <Button
        type="button"
        variant="secondary"
        loading={submitBusy}
        disabled={submitDisabled}
        onclick={(event) => void submit(event, true)}
      >
        {submitBusy ? t('mfa.checkinSubmitBusy') : t('mfa.checkinSubmitWithReceipt')}
      </Button>
      <Button type="submit" variant="primary" loading={submitBusy} disabled={submitDisabled}>
        {submitBusy ? t('mfa.checkinSubmitBusy') : t('mfa.checkinSubmit')}
      </Button>
    </div>
  </form>
</Modal>
