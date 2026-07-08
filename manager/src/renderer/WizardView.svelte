<script lang="ts">
  import { onMount } from 'svelte';
  import type { HostStatus } from '../shared/host-status.js';
  import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
  import type { WizardPresentation } from './manager-navigation.js';
  import { managerShell, wizardFullscreen } from './manager-shell-state.svelte.js';
  import {
    createWizardController,
    type WizardController,
    type WizardControllerState,
  } from './wizard-controller.js';
  import {
    getWizardCallbacks,
    registerWizardViewAdapter,
  } from './wizard-view-adapter.js';
  import {
    wizardBackHidden,
    wizardCompletionItSettingsUrl,
    wizardIsCompleted,
    wizardNextButtonDisabled,
    wizardNextButtonLabel,
  } from './wizard-view-model.js';
  import WizardStepIndicator from './WizardStepIndicator.svelte';
  import WizardSteps from './WizardSteps.svelte';

  let snapshot = $state<WizardControllerState | null>(null);
  let controller = $state<WizardController | null>(null);
  let hostPlatform = $state('linux');

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
      onComplete: () => getWizardCallbacks().onComplete?.(),
      onCancel: () => getWizardCallbacks().onCancel?.(),
      onStateChange: syncSnapshot,
    });
    syncSnapshot();

    const unregister = registerWizardViewAdapter({
      show(status: HostStatus | null, presentation: WizardPresentation) {
        controller?.show(status, presentation);
        syncSnapshot();
      },
      hide() {
        controller?.hide();
        syncSnapshot();
      },
    });

    return unregister;
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

    <WizardStepIndicator current={snapshot.step} />

    {#if snapshot.error}
      <p id="wizard-error" class="error">{snapshot.error}</p>
    {/if}

    {#if controller}
      <WizardSteps {snapshot} {controller} {hostPlatform} onPatch={syncSnapshot} />
    {/if}

    <footer class="wizard-actions" id="wizard-actions" hidden={completed}>
      <button
        type="button"
        id="wizard-back"
        class="btn-secondary"
        hidden={wizardBackHidden(snapshot)}
        disabled={snapshot.busy}
        onclick={() => {
          controller?.goBack();
          syncSnapshot();
        }}
      >
        Zurück
      </button>
      <button
        type="button"
        id="wizard-next"
        disabled={wizardNextButtonDisabled(snapshot)}
        onclick={() => {
          void controller?.goNext().then(syncSnapshot);
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
    </footer>

    <footer class="wizard-completion-actions" id="wizard-completion-actions" hidden={!completed}>
      <button
        type="button"
        id="wizard-complete-status"
        class="btn-secondary"
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
        IT-Einstellungen in Praxis Flow öffnen
      </button>
    </footer>
  {/if}
</div>
