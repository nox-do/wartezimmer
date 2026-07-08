import type { HostStatus } from '../shared/host-status.js';
import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
import type { WizardPresentation } from './manager-navigation.js';
import { gatewayBridgeDefaultsFromNetwork } from './wizard-state.js';
import {
  pickAndLoadReleaseArchive,
  WIZARD_RELEASE_IMPORT_LOADING_MESSAGE,
} from './delivery-images-flow.js';
import {
  applyWizardSetup,
  createWizardFlowState,
  loadWizardNetwork,
  loadWizardPlan,
  persistWizardRoutingMode,
  planWizardAdvance,
  previousWizardStep,
  refreshWizardStatus,
  refreshWizardStatusAfterApply,
  WIZARD_PROBE_WAIT_MESSAGE,
  type WizardAdvanceAfter,
  type WizardFlowState,
  type WizardStep,
} from './wizard-flow.js';

export type WizardCallbacks = {
  onComplete: () => void;
  onCancel: () => void;
};

export type WizardControllerState = WizardFlowState & {
  busy: boolean;
  probeStatusText: string | null;
  error: string | null;
  presentation: WizardPresentation;
  complexRoutingLicensed: boolean;
};

export type WizardControllerDeps = WizardCallbacks & {
  api: PraxisManagerApi;
  onStateChange?: () => void;
};

export type WizardController = {
  getState: () => Readonly<WizardControllerState>;
  patchFields: (patch: Partial<WizardFlowState>) => void;
  show: (status: HostStatus | null, presentation?: WizardPresentation) => void;
  hide: () => void;
  goNext: () => Promise<void>;
  goBack: () => void;
  cancel: () => void;
  complete: () => void;
  openItSettings: () => void;
  refreshPrerequisites: () => Promise<void>;
  loadReleaseArchive: () => Promise<void>;
  browseImportsFolder: () => Promise<string | null>;
  browseExportsFolder: () => Promise<string | null>;
};

function createInitialState(
  status: HostStatus | null,
  presentation: WizardPresentation = 'embedded',
): WizardControllerState {
  return {
    ...createWizardFlowState(status),
    busy: false,
    probeStatusText: null,
    error: null,
    presentation,
    complexRoutingLicensed: true,
  };
}

export function createWizardController(deps: WizardControllerDeps): WizardController {
  let state = createInitialState(null);

  function notify(): void {
    deps.onStateChange?.();
  }

  function patch(partial: Partial<WizardControllerState>): void {
    state = { ...state, ...partial };
    notify();
  }

  function setBusy(busy: boolean): void {
    patch({ busy });
  }

  function setError(message: string | null): void {
    patch({ error: message });
  }

  async function browseFolder(
    field: 'importsHostPath' | 'exportsHostPath',
  ): Promise<string | null> {
    const current = state[field].trim() || undefined;
    const result = await deps.api.selectFolder(current);
    if (result.canceled || !result.path) {
      return null;
    }
    patch({ [field]: result.path });
    return result.path;
  }

  async function runWizardAfterAction(after: WizardAdvanceAfter): Promise<void> {
    if (after === 'loadNetwork') {
      const network = await loadWizardNetwork(deps.api);
      patch({
        network,
        ...gatewayBridgeDefaultsFromNetwork(state, network),
      });
      return;
    }
    if (after === 'loadPlan') {
      patch({ plan: await loadWizardPlan(deps.api, state) });
      return;
    }
    patch({
      applyResult: await applyWizardSetup(deps.api, state),
      probeStatusText: WIZARD_PROBE_WAIT_MESSAGE,
    });
    patch({
      status: await refreshWizardStatusAfterApply(deps.api),
      probeStatusText: null,
    });
    try {
      await persistWizardRoutingMode(deps.api, state);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Routing-Modus konnte nach der Einrichtung nicht gespeichert werden.',
      );
    }
  }

  function ensureRoutingCapabilities(): void {
    void deps.api
      .getRoutingMode()
      .then((capabilities) => {
        if (state.step !== 3) {
          return;
        }
        patch({
          routingMode: capabilities.routingMode,
          complexRoutingLicensed: capabilities.features.complexRoutingLicensed,
        });
      })
      .catch(() => {
        if (state.step === 3) {
          patch({ complexRoutingLicensed: true });
        }
      });
  }

  function enterStep(step: WizardStep): void {
    if (step === 3) {
      ensureRoutingCapabilities();
    }
  }

  return {
    getState: () => state,

    patchFields(partial) {
      patch(partial);
    },

    show(status, presentation = 'embedded') {
      state = createInitialState(status, presentation);
      notify();
    },

    hide() {
      state = createInitialState(null);
      notify();
    },

    async goNext() {
      setError(null);
      setBusy(true);
      try {
        const action = planWizardAdvance(state.step, state);
        if (action.type === 'validate-error') {
          setError(action.message);
          return;
        }
        if (action.type === 'complete') {
          deps.onComplete();
          return;
        }

        patch({ step: action.step, ...action.patch });
        enterStep(action.step);
        if (action.after) {
          await runWizardAfterAction(action.after);
        }
      } catch (error) {
        setError(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    },

    goBack() {
      if (state.step <= 1 || state.busy) {
        return;
      }
      if (state.step === 7 && state.applyResult) {
        return;
      }
      setError(null);
      const step = previousWizardStep(state.step);
      patch({ step });
      enterStep(step);
    },

    cancel() {
      if (!state.busy) {
        deps.onCancel();
      }
    },

    complete() {
      if (!state.busy) {
        deps.onComplete();
      }
    },

    openItSettings() {
      const url = state.status?.deviceUrls?.opsSetup ?? state.plan?.deviceUrls.opsSetup ?? null;
      if (url && !state.busy) {
        void deps.api.openExternalUrl(url);
      }
    },

    async refreshPrerequisites() {
      setBusy(true);
      try {
        patch({ status: await refreshWizardStatus(deps.api) });
        setError(null);
      } catch (error) {
        setError(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    },

    async loadReleaseArchive() {
      setError(null);
      setBusy(true);
      try {
        const pickResult = await pickAndLoadReleaseArchive(deps.api, {
          loadingMessage: WIZARD_RELEASE_IMPORT_LOADING_MESSAGE,
          onProgress: (progress) => {
            patch({ releaseImportStatus: progress.statusText });
          },
        });
        if (pickResult.canceled) {
          patch({ releaseImportStatus: null });
          return;
        }
        if (!pickResult.ok) {
          patch({ releaseImportStatus: null });
          if (pickResult.error) {
            setError(pickResult.error);
          }
          return;
        }
        patch({ status: await refreshWizardStatus(deps.api), releaseImportStatus: null });
      } finally {
        setBusy(false);
      }
    },

    browseImportsFolder: () => browseFolder('importsHostPath'),
    browseExportsFolder: () => browseFolder('exportsHostPath'),
  };
}
