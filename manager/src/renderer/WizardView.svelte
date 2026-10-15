<script lang="ts">
  import { wizardError, wizardIsBusy } from './wizard-controller.js';

  import { hasBlockingMaintenanceOperation } from '@wartezimmer/server-shared/manager-status-projection';
  import { managerStatusViewModel } from './manager-status-view-model.js';
  import { onMount } from 'svelte';
  import type { WartezimmerManagerApi } from '../shared/wartezimmer-manager-api.js';
  import { managerShell } from './manager-shell-state.svelte.js';
  import {
    createWizardController,
    type WizardController,
    type WizardControllerState,
  } from './wizard-controller.js';
  import {
    wizardBackHidden,
    wizardCompletionItSettingsUrl,
    wizardIsCompleted,
    wizardNextButtonDisabled,
    wizardNextButtonLabel,
  } from './wizard-view-model.js';
  import WizardStepIndicator from './WizardStepIndicator.svelte';
  import InstallRecoveryPanel from './InstallRecoveryPanel.svelte';
  import WizardSteps from './WizardSteps.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';

  let {
    onComplete,
    onCancel,
    onHostMutated,
  }: {
    onComplete: () => void;
    onCancel: () => void;
    onHostMutated?: () => void | Promise<void>;
  } = $props();

  let snapshot = $state<WizardControllerState | null>(null);
  let controller = $state<WizardController | null>(null);
  let hostPlatform = $state('linux');
  let lastSessionGeneration = $state<number | null>(null);
  let confirmOpen = $state(false);
  let confirmMessage = $state('');
  let confirmAction = $state<(() => void) | null>(null);
  let confirmCancel = $state<(() => void) | null>(null);

  const blocked = $derived(hasBlockingMaintenanceOperation(managerShell.configSnapshot) || hasBlockingMaintenanceOperation(snapshot?.status));
  const diagnosis = $derived(managerStatusViewModel(managerShell.configSnapshot ?? snapshot?.status ?? null, managerShell.runtimeObservation));

  function requestConfirm(message: string, onConfirm: () => void, onCancel?: () => void): void {
    confirmMessage = message;
    confirmAction = onConfirm;
    confirmCancel = onCancel ?? null;
    confirmOpen = true;
  }

  function closeConfirm(): void {
    const cancel = confirmCancel;
    confirmOpen = false;
    confirmMessage = '';
    confirmAction = null;
    confirmCancel = null;
    cancel?.();
  }

  function confirmAndRun(): void {
    const action = confirmAction;
    confirmOpen = false;
    confirmMessage = '';
    confirmAction = null;
    confirmCancel = null;
    if (!blocked) action?.();
  }

  function requireApi(): WartezimmerManagerApi {
    const api = window.wartezimmerManager;
    if (!api) {
      throw new Error(
        'Preload nicht geladen — Manager neu starten. (Hinweis: DevTools → Console nach Preload-Fehlern prüfen.)',
      );
    }
    return api;
  }

  function syncSnapshot(): void {
    snapshot = controller ? { ...controller.getState() } : null;
  }

  const completed = $derived(snapshot ? wizardIsCompleted(snapshot) : false);
  const embedded = $derived(snapshot?.presentation === 'embedded');
  const itSettingsUrl = $derived(snapshot ? wizardCompletionItSettingsUrl(snapshot) : null);

  onMount(() => {
    const api = requireApi();
    hostPlatform = api.hostPlatform;

    controller = createWizardController({
      api,
      onComplete,
      onCancel,
      onHostMutated,
      onStateChange: syncSnapshot,
      requestConfirm,
    });
    syncSnapshot();
  });

  $effect(() => {
    const c = controller;
    const session = managerShell.wizardSession;
    if (!c) {
      return;
    }

    if (!session) {
      if (lastSessionGeneration !== null) {
        c.hide();
        lastSessionGeneration = null;
      }
      closeConfirm();
      return;
    }

    if (session.generation !== lastSessionGeneration) {
      closeConfirm();
      lastSessionGeneration = session.generation;
      c.show(session.status, session.presentation);
    }
  });
</script>

<div
  id="wizard-view"
  class="app wizard"
  class:is-embedded={embedded}
  hidden={managerShell.activeView !== 'wizard'}
  aria-busy={wizardIsBusy(snapshot) ? 'true' : 'false'}
>
  {#if snapshot}
    <header class="app-header wizard-page-header" id="wizard-page-header" hidden={embedded}>
      <h1 id="wizard-title">Einrichtung</h1>
    </header>

    {#if wizardError(snapshot)}
      <p id="wizard-error" class="error">{wizardError(snapshot)}</p>
    {/if}

    {#if blocked}
      <p class={diagnosis.noticeClass}>{diagnosis.primary.summary}</p>
      <p>{diagnosis.primary.detail}</p>
      <button type="button" class="btn-secondary" onclick={onCancel}>Zum Status</button>
    {:else if snapshot.recoveryPhase && snapshot.recoveryPhase !== 'setup' && controller}
      <InstallRecoveryPanel {snapshot} {controller} {hostPlatform} />
    {:else}
    <WizardStepIndicator current={snapshot.step} />

    {#if controller}
      <WizardSteps {snapshot} {controller} {hostPlatform} />
    {/if}

    {#if !(snapshot.step === 8 && wizardIsBusy(snapshot))}
    <footer class="actions-row actions-row--footer" id="wizard-actions">
      {#if completed}
        <button
          type="button"
          id="wizard-complete-status"
          disabled={wizardIsBusy(snapshot)}
          onclick={() => controller?.complete()}
        >
          Zum Status
        </button>
        {#if snapshot.status?.deviceUrls?.mfa}
          <button type="button" disabled={wizardIsBusy(snapshot)} onclick={() => void requireApi().openExternalUrl(snapshot!.status!.deviceUrls!.mfa)}>MFA öffnen</button>
        {/if}
        <button
          type="button"
          id="wizard-complete-it-settings"
          class="btn-secondary"
          disabled={wizardIsBusy(snapshot) || !itSettingsUrl}
          onclick={() => controller?.openItSettings()}
        >
          Administration öffnen
        </button>
      {:else}
        <button
          type="button"
          id="wizard-back"
          class="btn-secondary"
          hidden={wizardBackHidden(snapshot)}
          disabled={wizardIsBusy(snapshot)}
          onclick={() => {
            controller?.goBack();
          }}
        >
          Zurück
        </button>
        <button
          type="button"
          id="wizard-next"
          disabled={wizardNextButtonDisabled(snapshot)}
          onclick={() => {
            void controller?.goNext();
          }}
        >
          {wizardNextButtonLabel(snapshot)}
        </button>
        <button
          type="button"
          id="wizard-cancel"
          class="btn-link"
          disabled={wizardIsBusy(snapshot)}
          onclick={() => controller?.cancel()}
        >
          {snapshot.step === 8 && snapshot.applyResult ? 'Status zur Fehlerprüfung öffnen' : 'Abbrechen'}
        </button>
      {/if}
    </footer>
    {/if}
    {/if}
  {/if}

  <ConfirmDialog open={confirmOpen && !blocked} onConfirm={confirmAndRun} onCancel={closeConfirm}>
    <p>{confirmMessage}</p>
  </ConfirmDialog>
</div>
