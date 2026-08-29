<script lang="ts">
  import { onMount } from 'svelte';
  import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
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
  import WizardSteps from './WizardSteps.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';

  let {
    onComplete,
    onCancel,
    onHostMutated,
  }: {
    onComplete: () => void;
    onCancel: () => void;
    onHostMutated?: () => void;
  } = $props();

  let snapshot = $state<WizardControllerState | null>(null);
  let controller = $state<WizardController | null>(null);
  let hostPlatform = $state('linux');
  let lastSessionGeneration = $state<number | null>(null);
  let confirmOpen = $state(false);
  let confirmMessage = $state('');
  let confirmAction = $state<(() => void) | null>(null);

  function requestConfirm(message: string, onConfirm: () => void): void {
    confirmMessage = message;
    confirmAction = onConfirm;
    confirmOpen = true;
  }

  function closeConfirm(): void {
    confirmOpen = false;
    confirmMessage = '';
    confirmAction = null;
  }

  function confirmAndRun(): void {
    const action = confirmAction;
    closeConfirm();
    action?.();
  }

  function requireApi(): PraxisManagerApi {
    const api = window.praxisManager;
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
      return;
    }

    if (session.generation !== lastSessionGeneration) {
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
  aria-busy={snapshot?.busy ? 'true' : 'false'}
>
  {#if snapshot}
    <header class="app-header wizard-page-header" id="wizard-page-header" hidden={embedded}>
      <h1 id="wizard-title">Einrichtung</h1>
    </header>

    <WizardStepIndicator
      current={snapshot.step}
      httpsPhase={snapshot.httpsPhase}
      proxyEnabled={snapshot.proxyEnabled}
    />

    {#if snapshot.error}
      <p id="wizard-error" class="error">{snapshot.error}</p>
    {/if}

    {#if controller}
      <WizardSteps {snapshot} {controller} {hostPlatform} />
    {/if}

    <footer class="actions-row actions-row--footer" id="wizard-actions">
      {#if completed}
        <button
          type="button"
          id="wizard-complete-status"
          disabled={snapshot.busy}
          onclick={() => controller?.complete()}
        >
          Zum Status
        </button>
        <button
          type="button"
          id="wizard-complete-it-settings"
          class="btn-secondary"
          disabled={snapshot.busy || !itSettingsUrl}
          onclick={() => controller?.openItSettings()}
        >
          IT-Einstellungen
        </button>
      {:else}
        <button
          type="button"
          id="wizard-back"
          class="btn-secondary"
          hidden={wizardBackHidden(snapshot)}
          disabled={snapshot.busy}
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
          disabled={snapshot.busy}
          onclick={() => controller?.cancel()}
        >
          Abbrechen
        </button>
      {/if}
    </footer>
  {/if}

  <ConfirmDialog open={confirmOpen} onConfirm={confirmAndRun} onCancel={closeConfirm}>
    <p>{confirmMessage}</p>
  </ConfirmDialog>
</div>
