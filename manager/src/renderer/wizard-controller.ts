import type {
  RecoveryBackupCandidate,
  InstallRecoveryPreview,
  InstallOperationSummary,
} from '../shared/host-status.js';
import type { HostStatus } from '../shared/host-status.js';
import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
import type { WizardPresentation } from './manager-navigation.js';
import {
  pickAndLoadReleaseArchive,
  WIZARD_RELEASE_IMPORT_LOADING_MESSAGE,
} from './delivery-images-flow.js';
import {
  applyWizardSetup,
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
} from './wizard-flow.js';
import { resolvedLanIp } from './wizard-state.js';

export type WizardCallbacks = {
  onComplete: () => void;
  onCancel: () => void;
};

export type WizardControllerState = WizardFlowState & {
  busy: boolean;
  probeStatusText: string | null;
  error: string | null;
  presentation: WizardPresentation;
  recoveryPhase: 'choose' | 'prepared' | 'setup' | 'finish' | 'restart' | null;
  recoveryCandidates: RecoveryBackupCandidate[];
  backupCandidateId: string;
  operation: InstallOperationSummary | null;
  recoveryPreview: InstallRecoveryPreview | null;
};

export type WizardControllerDeps = WizardCallbacks & {
  api: PraxisManagerApi;
  onStateChange?: () => void;
  /** Nach Apply / Stack-Start — Health-Header und Shell-Status aktualisieren. */
  onHostMutated?: () => void | Promise<void>;
  requestConfirm?: (message: string, onConfirm: () => void, onCancel?: () => void) => void;
};

export type WizardController = {
  getState: () => Readonly<WizardControllerState>;
  selectRecoveryBackup: (id: string) => void;
  prepareRecovery: () => Promise<void>;
  commitRecovery: () => void;
  abortRecovery: () => Promise<void>;
  refreshRecovery: () => Promise<void>;
  finishRecovery: (action: 'restore' | 'without-backup') => Promise<void>;
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
    recoveryPhase: status?.mode === 'install' ? 'choose' : null,
    recoveryCandidates: [],
    backupCandidateId: '',
    operation: null,
    recoveryPreview: null,
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

  async function recoveryAction(action: (generation: number) => Promise<void>): Promise<void> {
    if (state.busy) return;
    const generation = lifecycleGeneration;
    patch({ busy: true, error: null });
    try {
      await action(generation);
    } catch (error) {
      if (still(generation)) setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (still(generation)) setBusy(false);
    }
  }

  async function loadRecovery(generation: number): Promise<void> {
    const status = await deps.api.fetchSetupStatus();
    if (!still(generation)) return;
    const installation = status.installation;
    const operation =
      installation.kind === 'installing' || installation.kind === 'docker-unavailable'
        ? (installation.operation ?? null)
        : null;
    patch({ status, operation });
    if (installation.kind === 'docker-unavailable') {
      setError(installation.reason);
      return;
    }
    if (operation?.phase === 'prepared') {
      patch({ recoveryPhase: 'prepared' });
      return;
    }
    if (operation) {
      patch({ recoveryPhase: 'restart' });
      const preview = await deps.api.previewInstallRecovery(operation.id);
      if (!still(generation)) return;
      patch({
        recoveryPreview: preview,
        recoveryPhase: preview.baselineReady
          ? 'finish'
          : !status.network.configuredLanIp && status.deliveryImages.ready
            ? 'setup'
            : 'finish',
      });
      return;
    }
    const candidates = await deps.api.discoverRecoveryBackups();
    if (still(generation)) patch({ recoveryCandidates: candidates, recoveryPhase: 'choose' });
  }

  async function finishRecovery(action: 'restore' | 'without-backup'): Promise<void> {
    await recoveryAction(async (generation) => {
      if (!state.operation) throw new Error('Kein Installationsvorgang.');
      const result = await deps.api.finishInstallRecovery({
        operationId: state.operation.id,
        action,
      });
      if (!still(generation)) return;
      if (!result.ok) throw new Error(result.errors.join(' '));
      // Publish the completed installation before navigation starts its own refresh.
      await deps.onHostMutated?.();
      if (!still(generation)) return;
      patch({ operation: null, recoveryPhase: null });
      deps.onComplete();
    });
  }

  async function commitRecovery(): Promise<void> {
    await recoveryAction(async (generation) => {
      if (!state.operation) throw new Error('Kein Installationsvorgang.');
      await deps.api.commitInstall({ operationId: state.operation.id, replaceConfirmed: true });
      const status = await deps.api.fetchSetupStatus();
      if (!still(generation)) return;
      const operation =
        status.installation.kind === 'installing' ? status.installation.operation : null;
      patch({
        ...createInitialState(status, state.presentation),
        operation,
        recoveryPhase: 'setup',
        busy: true,
      });
      deps.onHostMutated?.();
    });
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
        ...(!resolvedLanIp(state) && network.lanCandidates[0]
          ? { lanAppIp: network.lanCandidates[0].address, customLanIp: '' }
          : {}),
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
    const operation = state.operation;
    const applyResult = await applyWizardSetup(deps.api, applyState);
    if (!still(generation)) {
      deps.onHostMutated?.();
      return;
    }
    patch({
      applyResult,
      probeStatusText: operation
        ? 'App und Sandbox starten — Abschlussprüfung läuft …'
        : WIZARD_PROBE_WAIT_MESSAGE,
    });
    let recoveryPreview: InstallRecoveryPreview | null = null;
    const status = await refreshWizardStatusAfterApply(deps.api, {
      shouldContinue: () => still(generation),
      ...(operation
        ? {
            additionalReady: async () => {
              recoveryPreview = await deps.api.previewInstallRecovery(operation.id);
              return recoveryPreview.baselineReady;
            },
          }
        : {}),
    });
    if (!still(generation)) {
      deps.onHostMutated?.();
      return;
    }
    patch({ status, probeStatusText: null });
    if (operation) patch({ recoveryPreview, recoveryPhase: 'finish' });
    deps.onHostMutated?.();
  }

  return {
    getState: () => state,
    selectRecoveryBackup(id) {
      if (!state.busy) patch({ backupCandidateId: id });
    },
    async prepareRecovery() {
      await recoveryAction(async (generation) => {
        const picked = await deps.api.selectReleaseArchive();
        if (!still(generation) || picked.canceled || !picked.path) return;
        const status = await deps.api.fetchSetupStatus();
        if (!still(generation)) return;
        const result = await deps.api.prepareInstall({
          archivePath: picked.path,
          mode: status.installation.kind === 'fresh' ? 'fresh' : 'replace',
          ...(state.backupCandidateId ? { backupCandidateId: state.backupCandidateId } : {}),
        });
        if (!still(generation)) return;
        patch({ operation: result.operation, recoveryPhase: 'prepared' });
        deps.onHostMutated?.();
      });
    },
    commitRecovery() {
      if (state.busy || !state.operation) return;
      const generation = lifecycleGeneration;
      if (state.operation.mode === 'replace' || state.operation.phase === 'installing') {
        deps.requestConfirm?.(
          'Neu installieren? Alte Laufzeitdaten und Dokument-Intake werden gelöscht. Geräte müssen neu gekoppelt werden. Automatische Backups bleiben erhalten. HTTPS wird nur aus dem ausgewählten Backup übernommen.',
          () => {
            if (still(generation)) void commitRecovery();
          },
        );
      } else {
        void commitRecovery();
      }
    },
    async abortRecovery() {
      await recoveryAction(async (generation) => {
        if (!state.operation) return;
        await deps.api.abortInstall(state.operation.id);
        if (!still(generation)) return;
        patch({ operation: null, recoveryPhase: 'choose' });
        await loadRecovery(lifecycleGeneration);
        deps.onHostMutated?.();
      });
    },
    finishRecovery,
    async refreshRecovery() {
      await recoveryAction(async (generation) => {
        if (!state.operation) return;
        const preview = await deps.api.previewInstallRecovery(state.operation.id);
        if (still(generation)) patch({ recoveryPreview: preview, recoveryPhase: 'finish' });
      });
    },

    patchFields(partial) {
      patch(partial);
    },

    show(status, presentation = 'embedded') {
      beginSession();
      state = createInitialState(status, presentation);
      notify();
      if (status?.mode === 'install') void recoveryAction(() => loadRecovery(lifecycleGeneration));
    },

    hide() {
      beginSession();
      state = createInitialState(null);
      notify();
    },

    async goNext() {
      if (state.busy || (state.recoveryPhase && state.recoveryPhase !== 'setup')) return;
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
        patch({ step: action.step, ...action.patch });
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
      if (action.type === 'goto') {
        patch({ step: action.step, ...action.patch });
      }
    },

    cancel() {
      if (!state.busy) {
        deps.onCancel();
      }
    },

    complete() {
      if (state.operation) {
        void finishRecovery('without-backup');
        return;
      }
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
