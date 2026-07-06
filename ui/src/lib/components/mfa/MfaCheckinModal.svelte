<script lang="ts">
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
  let topicsLoaded = $state(false);

  let submitBusy = $state(false);
  let lookupBusy = $state(false);
  let lookupError = $state('');
  let candidates = $state<MfaLookupCandidate[]>([]);
  let selectedIdentityRef = $state('');

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
    candidates.find((candidate) => candidate.identityRef === selectedIdentityRef) ?? null,
  );
  const selectedTopic = $derived(topics.find((topic) => topic.topicId === topicId) ?? null);
  const submitDisabled = $derived(!topicId || submitBusy || lookupBusy);
  let lookupRunId = 0;

  function resetForm() {
    lookupQuery = '';
    birthDate = '';
    lookupError = '';
    lookupBusy = false;
    candidates = [];
    selectedIdentityRef = '';
  }

  async function ensureTopicsLoaded() {
    if (topicsLoaded || topicsLoading) {
      return;
    }
    topicsLoading = true;
    const result = await fetchMfaCheckinTopics();
    topicsLoading = false;
    topicsLoaded = true;
    if (!result.ok) {
      toastStore.error(result.error.message || t('mfa.checkinTopicLoadError'));
      return;
    }
    topics = result.data.topics.map((topic) => ({ topicId: topic.topicId, label: topic.label }));
    if (!topicId && topics.length > 0) {
      topicId = topics[0]!.topicId;
    }
  }

  function candidateLabel(candidate: MfaLookupCandidate): string {
    const first = candidate.firstName?.trim() ?? '';
    const last = candidate.lastName?.trim() ?? '';
    const full = `${first} ${last}`.trim();
    return full || candidate.identityRef;
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
      selectedIdentityRef = '';
      lookupBusy = false;
      return;
    }
    if (!hasLookupInput) {
      candidates = [];
      selectedIdentityRef = '';
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
      selectedIdentityRef = '';
      return;
    }
    candidates = result.data.candidates;
    if (candidates.length === 1) {
      selectedIdentityRef = candidates[0]!.identityRef;
      return;
    }
    if (!candidates.some((candidate) => candidate.identityRef === selectedIdentityRef)) {
      selectedIdentityRef = '';
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
    const identityRef = selectedCandidate?.identityRef ?? undefined;
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
      lookupRunId += 1;
      return;
    }
    void ensureTopicsLoaded();
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
    selectedIdentityRef = '';
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

    <label class="modal-form-field">
      <span>{t('mfa.checkinTopicLabel')}</span>
      <select class="form-select" bind:value={topicId} disabled={topicsLoading || submitBusy}>
        {#if topics.length === 0}
          <option value="">{t('mfa.checkinTopicPlaceholder')}</option>
        {:else}
          {#each topics as topic (topic.topicId)}
            <option value={topic.topicId}>{topic.label}</option>
          {/each}
        {/if}
      </select>
    </label>

    <label class="modal-form-field">
      <span>{t('mfa.checkinLookupLabel')}</span>
      <input
        class="form-input"
        type="text"
        inputmode="text"
        autocomplete="off"
        placeholder={t('mfa.checkinLookupPlaceholder')}
        bind:value={lookupQuery}
        disabled={submitBusy}
      />
    </label>
    <label class="modal-form-field">
      <span>{t('mfa.checkinBirthDateLabel')}</span>
      <input
        class="form-input"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        placeholder={t('mfa.checkinBirthDatePlaceholder')}
        bind:value={birthDate}
        disabled={submitBusy}
      />
    </label>
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
        {#each candidates as candidate (candidate.identityRef)}
          <label class="mfa-checkin-candidate">
            <input
              type="radio"
              name="mfa-checkin-candidate"
              value={candidate.identityRef}
              checked={selectedIdentityRef === candidate.identityRef}
              onchange={() => {
                selectedIdentityRef = candidate.identityRef;
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
