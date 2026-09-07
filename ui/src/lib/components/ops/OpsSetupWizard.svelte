<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { gotoResolved } from '$lib/navigation/kit-paths';
  import Button from '$lib/components/forms/Button.svelte';
  import OpsContactLookupForm from '$lib/components/ops/OpsContactLookupForm.svelte';
  import OpsPortalSettings from '$lib/components/ops/OpsPortalSettings.svelte';
  import OpsPracticeProfileForm from '$lib/components/ops/OpsPracticeProfileForm.svelte';
  import OpsSetupChecklist from '$lib/components/ops/OpsSetupChecklist.svelte';
  import OpsSevenMessagingSettings from '$lib/components/ops/OpsSevenMessagingSettings.svelte';
  import StaffSettingsShell from '$lib/components/shared/StaffSettingsShell.svelte';
  import {
    applyContactLookupDemo,
    fetchOpsOnboarding,
    fetchOpsSystemSettings,
    patchOpsOnboarding,
    verifyOpsOnboarding,
    type OpsOnboardingStatus,
    type SetupCheck,
    type SetupContactMode,
    type SetupWizardStep,
  } from '$lib/ops/ops-system-api';
  import { mapSetupCheckHint, isSetupCheckPending } from '$lib/ops/setup-check-hints';
  import type { AppDict } from '$lib/i18n/core/I18nTypes';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import { toastStore } from '$lib/stores/toastStore';

  const STEPS: SetupWizardStep[] = [
    'welcome',
    'practice',
    'storage',
    'contacts',
    'messaging',
    'portal',
    'verify',
  ];

  let verifyMessage = $state<string | null>(null);

  let loading = $state(true);
  let busy = $state(false);
  let status = $state<OpsOnboardingStatus | null>(null);
  let step = $state<SetupWizardStep>('welcome');
  let portalEnabled = $state(false);
  let contactMode = $state<SetupContactMode>('unset');
  let persistedContactMode = $state<SetupContactMode>('unset');
  let contactsOwnReady = $state(false);
  let practiceForm = $state<OpsPracticeProfileForm | null>(null);
  let practiceFormLoading = $state(false);

  const practiceStepBusy = $derived(step === 'practice' && practiceFormLoading);

  $effect(() => {
    if (step !== 'practice') {
      practiceFormLoading = false;
    }
  });

  const SETUP_CHECK_LABEL_KEYS: Record<string, keyof AppDict['ops']['setup']['check']> = {
    'practiceProfile.configured': 'practiceProfile_configured',
    'storage.importsReady': 'storage_importsReady',
    'storage.exportsReady': 'storage_exportsReady',
    'contactLookup.configured': 'contactLookup_configured',
    'contactLookup.parseable': 'contactLookup_parseable',
    'messaging.configured': 'messaging_configured',
    'messaging.providerSelected': 'messaging_providerSelected',
  };

  function checkLabel(id: string): string {
    const suffix = SETUP_CHECK_LABEL_KEYS[id];
    return suffix ? t(`ops.setup.check.${suffix}`) : id;
  }

  function checkHintText(check: SetupCheck): string | null {
    if (check.ok || !check.hint) {
      return null;
    }
    return mapSetupCheckHint(check.hint);
  }

  function findCheckIn(snapshot: OpsOnboardingStatus, id: string) {
    return snapshot.checks.find((check) => check.id === id);
  }

  function findCheck(id: string) {
    return status ? findCheckIn(status, id) : undefined;
  }

  /** Contact lookup folder saved in settings; full parse only after verify or explicit test/apply. */
  function isContactLookupReady(snapshot: OpsOnboardingStatus = status!): boolean {
    const parseable = findCheckIn(snapshot, 'contactLookup.parseable');
    const configured = findCheckIn(snapshot, 'contactLookup.configured');
    return parseable?.ok === true || configured?.ok === true;
  }

  function canLeaveContactsStep(): boolean {
    if (contactMode === 'unset') {
      return false;
    }
    if (contactMode === 'sample' || contactMode === 'own') {
      return contactsOwnReady || isContactLookupReady();
    }
    return false;
  }

  const VERIFY_STEPS = new Set<SetupWizardStep>(['storage', 'portal', 'verify']);

  function normalizeWizardStep(value: SetupWizardStep): SetupWizardStep {
    if (value === 'summary') {
      return 'verify';
    }
    if (STEPS.includes(value)) {
      return value;
    }
    return 'welcome';
  }

  async function ensurePracticePrefilled() {
    if (step !== 'practice' || loading) {
      return;
    }
    await tick();
    if (!practiceForm) {
      return;
    }
    await practiceForm.load();
  }

  function syncVerifyMessage() {
    if (!status) {
      return;
    }
    verifyMessage = status.requiredChecksOk
      ? t('ops.setup.verifyResultOk')
      : t('ops.setup.verifyResultBad');
  }

  function storagePillState(checkId: string): 'ok' | 'pending' | 'bad' {
    const check = findCheck(checkId);
    if (!check) {
      return 'pending';
    }
    if (check.ok) {
      return 'ok';
    }
    if (isSetupCheckPending(check.hint)) {
      return 'pending';
    }
    return 'bad';
  }

  function storagePillLabel(state: 'ok' | 'pending' | 'bad'): string {
    if (state === 'ok') {
      return t('ops.storageReady');
    }
    if (state === 'pending') {
      return t('ops.setup.storagePending');
    }
    return t('ops.storageNotReady');
  }

  const storageImportsState = $derived(storagePillState('storage.importsReady'));
  const storageExportsState = $derived(storagePillState('storage.exportsReady'));

  const showChecksPendingBanner = $derived(
    status != null &&
      !status.checksVerified &&
      (step === 'storage' || step === 'portal' || step === 'verify'),
  );

  function syncContactModeFromSnapshot(snapshot: OpsOnboardingStatus) {
    contactMode = snapshot.setupContactMode;
    persistedContactMode = snapshot.setupContactMode;
    contactsOwnReady =
      snapshot.setupContactMode === 'own' && isContactLookupReady(snapshot);
  }

  function applyOnboardingSnapshot(snapshot: OpsOnboardingStatus) {
    status = snapshot;
    step = normalizeWizardStep(snapshot.setupLastStep);
    portalEnabled = snapshot.portalEnabled;
    syncContactModeFromSnapshot(snapshot);
  }

  async function ensurePracticeStepIfNeeded(): Promise<boolean> {
    if (stepIndex(step) <= stepIndex('practice')) {
      return true;
    }
    const settings = await fetchOpsSystemSettings();
    if (!settings.ok) {
      toastStore.error(settings.error.message || t('ops.loadError'));
      return false;
    }
    if (settings.data.practiceProfile.displayName.trim()) {
      return true;
    }
    if (!(await persistProgress('practice'))) {
      return false;
    }
    await ensurePracticePrefilled();
    return true;
  }

  async function refreshStatus() {
    const result = await fetchOpsOnboarding();
    if (!result.ok) {
      toastStore.error(result.error.message || t('ops.loadError'));
      return false;
    }
    applyOnboardingSnapshot(result.data);
    if (result.data.setupCompletedAt) {
      await gotoResolved('/ops');
    }
    return true;
  }

  async function refreshVerifiedStatus(options: { syncMessage?: boolean } = {}) {
    const result = await verifyOpsOnboarding();
    if (!result.ok) {
      toastStore.error(result.error.message || t('ops.loadError'));
      return false;
    }
    applyOnboardingSnapshot(result.data);
    if (options.syncMessage) {
      syncVerifyMessage();
    }
    if (result.data.setupCompletedAt) {
      await gotoResolved('/ops');
    }
    return true;
  }

  onMount(() => {
    void (async () => {
      const ok = await refreshStatus();
      loading = false;
      if (!ok) {
        return;
      }
      if (!(await ensurePracticeStepIfNeeded())) {
        return;
      }
      await ensurePracticePrefilled();
      if (step === 'verify') {
        busy = true;
        await refreshVerifiedStatus({ syncMessage: true });
        busy = false;
      } else if (VERIFY_STEPS.has(step)) {
        await refreshVerifiedStatus();
      }
    })();
  });

  function stepIndex(current: SetupWizardStep) {
    return STEPS.indexOf(current);
  }

  async function persistProgress(nextStep: SetupWizardStep) {
    busy = true;
    const result = await patchOpsOnboarding({ setupLastStep: nextStep });
    busy = false;
    if (!result.ok) {
      toastStore.error(result.error.message || t('ops.loadError'));
      return false;
    }
    status = result.data;
    step = nextStep;
    portalEnabled = result.data.portalEnabled;
    syncContactModeFromSnapshot(result.data);
    return true;
  }

  async function goNext() {
    if (step === 'practice') {
      if (practiceForm?.isLoading()) {
        return;
      }
      if (practiceForm?.hasLoadError()) {
        toastStore.error(t('ops.loadError'));
        return;
      }
      if (!practiceForm?.isProfileLoaded()) {
        return;
      }
      if (!practiceForm.canContinue()) {
        toastStore.error(t('ops.practice.displayNameRequired'));
        return;
      }
      busy = true;
      const saved = await practiceForm.save();
      busy = false;
      if (!saved) {
        return;
      }
    }

    if (step === 'contacts' && !canLeaveContactsStep()) {
      toastStore.error(t('ops.setup.contactsNextBlocked'));
      return;
    }

    const idx = stepIndex(step);
    if (idx < 0 || idx >= STEPS.length - 1) {
      return;
    }
    const next = STEPS[idx + 1];
    if (!(await persistProgress(next))) {
      return;
    }
    if (next === 'practice') {
      await ensurePracticePrefilled();
    }
    if (next === 'verify') {
      busy = true;
      await refreshVerifiedStatus({ syncMessage: true });
      busy = false;
    } else if (VERIFY_STEPS.has(next)) {
      await refreshVerifiedStatus();
    }
  }

  async function setContactMode(mode: SetupContactMode) {
    if (mode === persistedContactMode) {
      contactMode = mode;
      return;
    }
    contactMode = mode;
    contactsOwnReady = false;
    busy = true;
    const result = await patchOpsOnboarding({ setupContactMode: mode });
    busy = false;
    if (!result.ok) {
      contactMode = persistedContactMode;
      toastStore.error(result.error.message || t('ops.loadError'));
      return;
    }
    status = result.data;
    syncContactModeFromSnapshot(result.data);
    if (mode === 'sample' && !isContactLookupReady(result.data)) {
      await activateSampleContacts();
    }
  }

  async function activateSampleContacts() {
    busy = true;
    const result = await applyContactLookupDemo();
    busy = false;
    if (!result.ok) {
      toastStore.error(result.error.message || t('ops.loadError'));
      return;
    }
    status = result.data;
    syncContactModeFromSnapshot(result.data);
    toastStore.success(t('ops.setup.contactsSampleOk'));
  }

  async function goBack() {
    const idx = stepIndex(step);
    if (idx <= 0) {
      return;
    }
    const prev = STEPS[idx - 1];
    if (!(await persistProgress(prev))) {
      return;
    }
    if (prev === 'practice') {
      await ensurePracticePrefilled();
    }
  }

  function failedCheckMessages(details: unknown): string[] {
    if (!details || typeof details !== 'object' || !('checks' in details)) {
      return [];
    }
    const checks = (details as { checks?: SetupCheck[] }).checks;
    if (!Array.isArray(checks)) {
      return [];
    }
    return checks
      .filter((check) => check.required && !check.ok)
      .map((check) => {
        const label = checkLabel(check.id);
        const hint = checkHintText(check);
        return hint ? `${label}: ${hint}` : label;
      });
  }

  async function runVerify() {
    busy = true;
    verifyMessage = null;
    const ok = await refreshVerifiedStatus({ syncMessage: true });
    busy = false;
    if (!ok) {
      verifyMessage = t('ops.setup.verifyFailed');
    }
  }

  async function finishSetup() {
    busy = true;
    const verified = await verifyOpsOnboarding();
    if (!verified.ok) {
      busy = false;
      toastStore.error(verified.error.message || t('ops.setup.verifyFailed'));
      return;
    }
    applyOnboardingSnapshot(verified.data);
    syncVerifyMessage();
    if (!verified.data.requiredChecksOk || !verified.data.checksVerified) {
      busy = false;
      toastStore.error(t('ops.setup.completeBlocked'));
      return;
    }

    const result = await patchOpsOnboarding({ completeOnboarding: true });
    busy = false;
    if (!result.ok) {
      const checkMessages = failedCheckMessages(result.error.details);
      const message =
        checkMessages.length > 0
          ? checkMessages.join(' · ')
          : result.error.message || t('ops.setup.completeBlocked');
      toastStore.error(message);
      await refreshVerifiedStatus({ syncMessage: true });
      return;
    }
    toastStore.success(t('ops.setup.completeOk'));
    await gotoResolved('/ops');
  }
</script>

{#snippet setupChecklist()}
  <OpsSetupChecklist checks={status!.checks} {checkLabel} {checkHintText} />
{/snippet}

<StaffSettingsShell title={t('ops.setup.wizardTitle')} backHref="/" backLabelKey="nav.home">
  {#if loading}
    <p class="text-muted">{t('ui.loading')}</p>
  {:else if status}
    <ol class="ops-setup-process" aria-label={t('ops.setup.progressLabel')}>
    {#each STEPS as wizardStep, index (wizardStep)}
      <li
        class="ops-setup-process__item"
        class:ops-setup-process__item--active={wizardStep === step}
        class:ops-setup-process__item--done={stepIndex(step) > index}
        aria-current={wizardStep === step ? 'step' : undefined}
      >
        <span class="ops-setup-process__num">{index + 1}</span>
        <span class="ops-setup-process__label">{t(`ops.setup.step.${wizardStep}`)}</span>
      </li>
    {/each}
  </ol>

  {#if showChecksPendingBanner}
    <p class="alert alert--warning" role="status">{t('ops.setup.checksNotVerifiedBanner')}</p>
  {/if}

  {#if step === 'welcome'}
    <section class="panel">
      <h2 class="panel__title">{t('ops.setup.welcomeTitle')}</h2>
      <h3 class="panel__title">{t('ops.setup.hostAgentTitle')}</h3>
      <p class="text-desc">{t('ops.setup.hostAgentBody')}</p>
    </section>
  {:else if step === 'practice'}
    <section class="panel">
      <h2 class="panel__title">{t('ops.practice.title')}</h2>
      <p class="text-desc">{t('ops.setup.practiceHint')}</p>
      <OpsPracticeProfileForm
        bind:this={practiceForm}
        variant="setup"
        disabled={busy}
        onLoadStateChange={(loading) => {
          practiceFormLoading = loading;
        }}
      />
    </section>
  {:else if step === 'storage'}
    <section class="panel">
      <h2 class="panel__title">{t('ops.storageTitle')}</h2>
      <p class="text-desc">{t('ops.setup.storageIntro')}</p>
      <ul class="ops-setup-list">
        <li>
          <code>{status.userFolders.imports}</code> — {t('ops.setup.storageImports')}
        </li>
        <li>
          <code>{status.userFolders.exports}</code> — {t('ops.setup.storageExports')}
        </li>
      </ul>
      <p class="text-desc">{t('ops.setup.storageHint')}</p>
      <p>
        {t('ops.storageImportsLabel')}:
        <span
          class="pill"
          class:pill--ok={storageImportsState === 'ok'}
          class:pill--pending={storageImportsState === 'pending'}
          class:pill--bad={storageImportsState === 'bad'}
        >
          {storagePillLabel(storageImportsState)}
        </span>
      </p>
      <p>
        {t('ops.storageExportsLabel')}:
        <span
          class="pill"
          class:pill--ok={storageExportsState === 'ok'}
          class:pill--pending={storageExportsState === 'pending'}
          class:pill--bad={storageExportsState === 'bad'}
        >
          {storagePillLabel(storageExportsState)}
        </span>
      </p>
    </section>
  {:else if step === 'contacts'}
    <section class="panel">
      <h2 class="panel__title">{t('ops.contactsTitle')}</h2>
      <p class="text-desc">{t('ops.setup.contactsQuestion')}</p>
      <fieldset class="ops-setup-fieldset">
        <legend class="sr-only">{t('ops.contactsTitle')}</legend>
        <label class="ops-setup-radio">
          <input
            type="radio"
            name="contact-mode"
            value="own"
            checked={contactMode === 'own'}
            onchange={() => void setContactMode('own')}
          />
          {t('ops.setup.contactsOwn')}
        </label>
        <label class="ops-setup-radio">
          <input
            type="radio"
            name="contact-mode"
            value="sample"
            checked={contactMode === 'sample'}
            onchange={() => void setContactMode('sample')}
          />
          {t('ops.setup.contactsSample')}
        </label>
      </fieldset>

      {#if contactMode === 'sample'}
        <p class="text-desc">{t('ops.setup.contactsSampleHint')}</p>
        {#if busy}
          <p class="text-muted">{t('ui.loading')}</p>
        {:else if isContactLookupReady()}
          <p class="text-desc">{t('ops.setup.contactsSampleReady')}</p>
        {/if}
      {:else if contactMode === 'own'}
        <OpsContactLookupForm
          variant="setup"
          importsFolderLabel={status.userFolders.imports}
          disabled={busy}
          initialReady={contactsOwnReady}
          onReadyChange={(ready) => {
            contactsOwnReady = ready;
          }}
        />
      {:else}
        <p class="text-desc">{t('ops.setup.contactsChooseMode')}</p>
      {/if}
    </section>
  {:else if step === 'messaging'}
    <section class="panel">
      <h2 class="panel__title">{t('ops.messagingTitle')}</h2>
      <OpsSevenMessagingSettings disabled={busy} setupMode />
    </section>
  {:else if step === 'portal'}
    <section class="panel">
      <h2 class="panel__title">{t('ops.setup.portalTitle')}</h2>
      <p class="text-desc">{t('ops.setup.portalLead')}</p>
      <OpsPortalSettings bind:portalEnabled disabled={busy} showSaveToast={false} loadOnMount={false} />
    </section>
  {:else if step === 'verify'}
    <section class="panel">
      <h2 class="panel__title">{t('ops.setup.verifyTitle')}</h2>
      <p class="text-desc">{t('ops.setup.verifyBody')}</p>
      {@render setupChecklist()}
      {#if busy && !verifyMessage}
        <p class="text-muted">{t('ops.setup.verifyRunning')}</p>
      {:else if verifyMessage}
        <p
          class="alert"
          class:alert--info={status.requiredChecksOk}
          class:alert--error={!status.requiredChecksOk}
        >
          {verifyMessage}
        </p>
      {:else if !status.requiredChecksOk}
        <p class="text-desc">{t('ops.setup.summaryBlocked')}</p>
      {/if}
    </section>
  {/if}

  <div class="staff-actions ops-setup-nav">
    <Button type="button" variant="outline" disabled={busy || stepIndex(step) <= 0} onclick={() => void goBack()}>
      {t('ops.setup.back')}
    </Button>
    {#if step === 'verify'}
      <div class="ops-setup-nav__primary">
        <Button type="button" variant="outline" loading={busy} onclick={() => void runVerify()}>
          {t('ops.setup.verifyRefresh')}
        </Button>
        <Button
          type="button"
          variant="primary"
          loading={busy}
          disabled={!status.requiredChecksOk || !status.checksVerified}
          onclick={() => void finishSetup()}
        >
          {t('ops.setup.finishButton')}
        </Button>
      </div>
    {:else}
      <Button
        type="button"
        variant="primary"
        loading={busy || practiceStepBusy}
        disabled={busy || practiceStepBusy}
        onclick={() => void goNext()}
      >
        {t('ops.setup.next')}
      </Button>
    {/if}
  </div>
  {/if}
</StaffSettingsShell>
