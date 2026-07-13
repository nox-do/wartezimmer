import type { HostStatus, PfupdateApplyResult } from '../shared/host-status.js';
import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
import {
  createInitialPfupdateWizardState,
  PFUPDATE_APPLY_LOADING_MESSAGE,
  type PfupdateWizardState,
} from './pfupdate-wizard-flow.js';
import { formatPfupdateFailure } from './pfupdate-flow.js';

export type PfupdateWizardCallbacks = {
  onAfterMutation?: () => void;
  onApplySuccess?: (result: Extract<PfupdateApplyResult, { ok: true }>) => void;
};

export type PfupdateWizardControllerDeps = PfupdateWizardCallbacks & {
  api: PraxisManagerApi;
  getHostStatus?: () => HostStatus | null;
  onStateChange?: () => void;
};

export type PfupdateWizardController = {
  getState: () => Readonly<PfupdateWizardState>;
  open: () => void;
  confirmApply: () => void;
  close: () => void;
};

function inspectErrorMessage(state: PfupdateWizardState): string {
  const inspect = state.inspect;
  if (!inspect) {
    return state.error ?? 'Update-Paket konnte nicht geprüft werden.';
  }
  const errors = inspect.errors ?? [];
  if (errors.length > 0) {
    return errors.join(' ');
  }
  return inspect.compatibility.warnings.join(' ') || 'Update-Paket ist nicht kompatibel.';
}

export function createPfupdateWizardController(
  deps: PfupdateWizardControllerDeps,
): PfupdateWizardController {
  let state = createInitialPfupdateWizardState();

  function notify(): void {
    deps.onStateChange?.();
  }

  function patch(partial: Partial<PfupdateWizardState>): void {
    state = { ...state, ...partial };
    notify();
  }

  async function pickAndInspect(): Promise<boolean> {
    const picked = await deps.api.selectPfupdateArchive();
    if (picked.canceled || !picked.path) {
      patch(createInitialPfupdateWizardState());
      return false;
    }

    patch({
      filePath: picked.path,
      phase: 'inspect',
      busy: true,
      statusText: 'Update-Paket wird geprüft …',
      error: null,
      inspect: null,
      applyResult: null,
    });

    try {
      const hostStatus = deps.getHostStatus?.();
      const inspect = await deps.api.inspectPfupdate({
        archivePath: picked.path,
        settingsFormatVersion: hostStatus?.settingsFormatVersion,
      });
      patch({
        inspect,
        phase: inspect.ok && inspect.compatibility.updateSupported ? 'preview' : 'failed',
        busy: false,
        statusText: '',
        error:
          inspect.ok && inspect.compatibility.updateSupported
            ? null
            : inspectErrorMessage({ ...state, inspect }),
      });
      return true;
    } catch (error) {
      patch({
        phase: 'failed',
        busy: false,
        statusText: '',
        error: error instanceof Error ? error.message : 'Update-Paket konnte nicht geprüft werden.',
      });
      return true;
    }
  }

  async function runApply(): Promise<void> {
    if (!state.filePath) {
      patch({ phase: 'failed', busy: false, error: 'Kein Update-Paket ausgewählt.' });
      return;
    }

    patch({
      phase: 'applying',
      busy: true,
      statusText: PFUPDATE_APPLY_LOADING_MESSAGE,
      error: null,
      applyResult: null,
    });

    try {
      const hostStatus = deps.getHostStatus?.();
      const result = await deps.api.applyPfupdate({
        archivePath: state.filePath,
        settingsFormatVersion: hostStatus?.settingsFormatVersion,
      });

      if (result.ok) {
        patch({
          phase: 'success',
          busy: false,
          statusText: '',
          applyResult: result,
          error: null,
        });
        deps.onApplySuccess?.(result);
        deps.onAfterMutation?.();
        return;
      }

      patch({
        phase: 'failed',
        busy: false,
        statusText: '',
        applyResult: result,
        error: formatPfupdateFailure(result),
      });
    } catch (error) {
      patch({
        phase: 'failed',
        busy: false,
        statusText: '',
        error: error instanceof Error ? error.message : 'Software-Update fehlgeschlagen.',
      });
    }
  }

  return {
    getState: () => state,
    open() {
      void pickAndInspect();
    },
    confirmApply() {
      if (state.busy || state.phase !== 'preview' || !state.filePath) {
        return;
      }
      void runApply();
    },
    close() {
      if (state.busy) {
        return;
      }
      patch(createInitialPfupdateWizardState());
    },
  };
}
