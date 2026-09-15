import type { HostStatus } from '../shared/host-status.js';
import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
import type { WizardPresentation } from './manager-navigation.js';
import {
  pickAndLoadReleaseArchive,
  WIZARD_RELEASE_IMPORT_LOADING_MESSAGE,
} from './delivery-images-flow.js';
import {
  applyWizardSetup,
  buildWizardPrepareTlsInput,
  createWizardFlowState,
  loadWizardNetwork,
  loadWizardPlan,
  planWizardAdvance,
  planWizardBack,
  refreshWizardStatus,
  refreshWizardStatusAfterApply,
  wizardUsesExistingTlsConfiguration,
  WIZARD_PROBE_WAIT_MESSAGE,
  type WizardAdvanceAfter,
  type WizardFlowState,
  type WizardStep,
} from './wizard-flow.js';
import { tlsDraftMatchesPrepared } from './tls-identity.js';
import { TLS_RESET_CONFIRM_MESSAGE, tlsErrorCopy } from './tls-network-view-model.js';
import { resolvedLanIp } from './wizard-state.js';

/**
 * Gemeinsamer ACME-Titel plus Wizard-Hinweis.
 * Die Netzwerk-Aktion „Erneut versuchen“ gilt hier nicht: ein zweites prepare
 * repariert den persistierten Registerfehler nicht.
 */
export function wizardManagedPrepareErrorFooter(): string {
  return `${tlsErrorCopy('acme').title} Zurück und HTTPS später unter Netzwerk fortsetzen.`;
}

export type WizardCallbacks = {
  onComplete: () => void;
  onCancel: () => void;
};

export type WizardControllerState = WizardFlowState & {
  busy: boolean;
  probeStatusText: string | null;
  error: string | null;
  presentation: WizardPresentation;
};

export type WizardControllerDeps = WizardCallbacks & {
  api: PraxisManagerApi;
  onStateChange?: () => void;
  /** Nach Apply / Stack-Start — Health-Header und Shell-Status aktualisieren. */
  onHostMutated?: () => void;
  requestConfirm?: (message: string, onConfirm: () => void, onCancel?: () => void) => void;
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
  stageWizardTlsCertificate: () => Promise<void>;
  openMailto: (href: string) => void;
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
  };
}

export function createWizardController(deps: WizardControllerDeps): WizardController {
  let state = createInitialState(null);
  let lifecycleGeneration = 0;

  function notify(): void {
    deps.onStateChange?.();
  }

  function still(generation: number): boolean {
    return generation === lifecycleGeneration;
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

  function beginSession(): void {
    lifecycleGeneration += 1;
  }

  async function browseFolder(
    field: 'importsHostPath' | 'exportsHostPath',
  ): Promise<string | null> {
    const generation = lifecycleGeneration;
    const current = state[field].trim() || undefined;
    const result = await deps.api.selectFolder(current);
    if (!still(generation) || result.canceled || !result.path) {
      return null;
    }
    patch({ [field]: result.path });
    return result.path;
  }

  async function hydrateOperatorRequest(generation: number): Promise<void> {
    const current = state.status?.tls;
    const lanIp = resolvedLanIp(state);
    if (
      !current ||
      current.mode !== 'managed' ||
      current.tokenConsumed ||
      !current.hostname ||
      !lanIp ||
      state.operatorRequest?.oneTimeToken
    ) {
      return;
    }
    try {
      const result = await deps.api.prepareHostTls({
        mode: 'managed',
        hostname: current.installationDomain || current.hostname,
        lanIp,
      });
      if (!still(generation) || !result.operatorRequest) {
        return;
      }
      patch({
        operatorRequest: result.operatorRequest,
        status: state.status ? { ...state.status, tls: result.tls } : state.status,
      });
    } catch {
      /* Mail replay stays without token if Setup refuses identity replay. */
    }
  }

  async function prepareDraftTls(generation: number): Promise<void> {
    const input = buildWizardPrepareTlsInput(state);
    if (!input.lanIp) {
      throw new Error('Bitte zuerst eine LAN-IP wählen.');
    }
    let result;
    try {
      result = await deps.api.prepareHostTls(input);
    } catch (error) {
      if (input.mode === 'managed') {
        throw new Error(wizardManagedPrepareErrorFooter(), { cause: error });
      }
      throw error instanceof Error ? error : new Error(String(error));
    }
    if (still(generation)) {
      patch({
        operatorRequest: result.operatorRequest,
        ipv4Reserved: true,
        mailAck: false,
        customPemStaged: false,
        httpsPreparedNameMode: state.nameMode,
        status: state.status ? { ...state.status, tls: result.tls } : state.status,
      });
    }
    if (input.mode === 'managed' && result.tls.state === 'error') {
      throw new Error(wizardManagedPrepareErrorFooter());
    }
  }

  async function replacePreparedIdentity(generation: number): Promise<void> {
    const reset = await deps.api.resetHostTls();
    if (still(generation)) {
      patch({
        operatorRequest: null,
        mailAck: false,
        customPemStaged: false,
        httpsPreparedNameMode: null,
        status: state.status ? { ...state.status, tls: reset.tls } : state.status,
      });
    }
    await prepareDraftTls(generation);
  }

  async function runReplacePreparedIdentity(): Promise<void> {
    const generation = lifecycleGeneration;
    setBusy(true);
    setError(null);
    try {
      await replacePreparedIdentity(generation);
      if (still(generation)) {
        patch({ step: 6, httpsPhase: 'mail', error: null });
      }
    } catch (error) {
      if (still(generation)) {
        setError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (still(generation)) {
        setBusy(false);
      }
    }
  }

  async function runPrepareTls(generation: number): Promise<'ok' | 'awaiting-confirm'> {
    const current = state.status?.tls;
    if (current && current.state !== 'off') {
      if (
        tlsDraftMatchesPrepared(
          { ...state, preparedNameMode: state.httpsPreparedNameMode },
          current,
        )
      ) {
        if (current.state === 'error' && current.mode === 'managed') {
          throw new Error(wizardManagedPrepareErrorFooter());
        }
        await hydrateOperatorRequest(generation);
        if (still(generation) && !state.httpsPreparedNameMode) {
          patch({ httpsPreparedNameMode: state.nameMode });
        }
        return 'ok';
      }
      if (deps.requestConfirm) {
        deps.requestConfirm(TLS_RESET_CONFIRM_MESSAGE, () => {
          if (!still(generation)) {
            return;
          }
          void runReplacePreparedIdentity();
        });
        return 'awaiting-confirm';
      }
      await replacePreparedIdentity(generation);
      return 'ok';
    }
    await prepareDraftTls(generation);
    return 'ok';
  }

  async function runWizardAfterAction(
    after: WizardAdvanceAfter,
    generation: number,
  ): Promise<void> {
    if (after === 'loadNetwork') {
      const network = await loadWizardNetwork(deps.api);
      if (!still(generation)) {
        return;
      }
      patch({
        network,
      });
      return;
    }
    if (after === 'loadPlan') {
      const plan = await loadWizardPlan(deps.api, state);
      if (still(generation)) {
        patch({ plan });
      }
      return;
    }
    const applyState = state;
    const applyResult = await applyWizardSetup(deps.api, applyState);
    if (still(generation)) {
      patch({
        applyResult,
        probeStatusText: WIZARD_PROBE_WAIT_MESSAGE,
      });
    }
    if (still(generation)) {
      const status = await refreshWizardStatusAfterApply(deps.api);
      if (still(generation)) {
        patch({
          status,
          probeStatusText: null,
        });
      }
    }
    deps.onHostMutated?.();
  }

  async function enterStep(_step: WizardStep): Promise<void> {}

  return {
    getState: () => state,

    patchFields(partial) {
      patch(partial);
    },

    show(status, presentation = 'embedded') {
      beginSession();
      state = createInitialState(status, presentation);
      notify();
    },

    hide() {
      beginSession();
      state = createInitialState(null);
      notify();
    },

    async goNext() {
      const generation = lifecycleGeneration;
      setError(null);
      setBusy(true);
      try {
        const action = planWizardAdvance(state.step, state);
        if (action.type === 'validate-error') {
          setError(action.message);
          return;
        }
        if (action.type === 'complete') {
          if (still(generation)) {
            deps.onComplete();
          }
          return;
        }
        if (action.type === 'https-phase') {
          if (action.after === 'prepareTls') {
            const outcome = await runPrepareTls(generation);
            if (!still(generation)) {
              return;
            }
            if (outcome === 'awaiting-confirm') {
              return;
            }
          }
          patch({ step: 6, httpsPhase: action.phase, error: null });
          return;
        }

        patch({ step: action.step, ...action.patch });
        await enterStep(action.step);
        if (!still(generation)) {
          return;
        }
        if (action.after) {
          await runWizardAfterAction(action.after, generation);
        }
      } catch (error) {
        if (still(generation)) {
          setError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (still(generation)) {
          setBusy(false);
        }
      }
    },

    goBack() {
      if (state.step <= 1 || state.busy) {
        return;
      }
      if (
        state.step === 8 &&
        (state.applyResult || wizardUsesExistingTlsConfiguration(state.status))
      ) {
        return;
      }
      setError(null);
      const action = planWizardBack(state);
      if (action.type === 'https-phase') {
        patch({ step: 6, httpsPhase: action.phase });
        return;
      }
      if (action.type === 'goto') {
        patch({ step: action.step, ...action.patch });
        void enterStep(action.step);
      }
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

    openMailto(href) {
      if (!state.busy && href.startsWith('mailto:')) {
        void deps.api.openExternalUrl(href);
      }
    },

    async stageWizardTlsCertificate() {
      const generation = lifecycleGeneration;
      setError(null);
      setBusy(true);
      try {
        const result = await deps.api.stageHostTlsCertificate();
        if (!still(generation) || result.canceled) {
          return;
        }
        patch({
          customPemStaged: true,
          status: state.status ? { ...state.status, tls: result.tls } : state.status,
        });
      } catch (error) {
        if (still(generation)) {
          setError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (still(generation)) {
          setBusy(false);
        }
      }
    },

    async refreshPrerequisites() {
      const generation = lifecycleGeneration;
      setBusy(true);
      try {
        const status = await refreshWizardStatus(deps.api);
        if (!still(generation)) {
          return;
        }
        patch({ status });
        setError(null);
      } catch (error) {
        if (still(generation)) {
          setError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (still(generation)) {
          setBusy(false);
        }
      }
    },

    async loadReleaseArchive() {
      const generation = lifecycleGeneration;
      setError(null);
      setBusy(true);
      try {
        const pickResult = await pickAndLoadReleaseArchive(deps.api, {
          loadingMessage: WIZARD_RELEASE_IMPORT_LOADING_MESSAGE,
          onProgress: (progress) => {
            if (still(generation)) {
              patch({ releaseImportStatus: progress.statusText });
            }
          },
        });
        if (!still(generation)) {
          return;
        }
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
        const status = await refreshWizardStatus(deps.api);
        if (!still(generation)) {
          return;
        }
        patch({ status, releaseImportStatus: null });
      } catch (error) {
        if (still(generation)) {
          patch({ releaseImportStatus: null });
          setError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (still(generation)) {
          setBusy(false);
        }
      }
    },

    browseImportsFolder: () => browseFolder('importsHostPath'),
    browseExportsFolder: () => browseFolder('exportsHostPath'),
  };
}
