import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
import {
  canRetryRestoreAfterFailure,
  canSkipRestoreAfterFailure,
  createInitialRestoreWizardState,
  restoreInspectBlockedMessage,
  suggestCredentialSkipAfterRestoreFailure,
  type RestoreWizardState,
} from './restore-wizard-flow.js';

export type RestoreWizardCallbacks = {
  onAfterMutation?: () => void;
};

export type RestoreWizardControllerDeps = RestoreWizardCallbacks & {
  api: PraxisManagerApi;
  onStateChange?: () => void;
};

export type RestoreWizardController = {
  getState: () => Readonly<RestoreWizardState>;
  openStandalone: () => void;
  openPreUpdate: (onComplete: () => void) => void;
  chooseRestore: (restore: boolean) => void;
  confirmRestore: () => void;
  cancelHttpsConfirmation: () => void;
  retryRestore: () => void;
  skipAfterFailure: () => void;
  close: () => void;
  setSkipProviderCredentials: (value: boolean) => void;
};

export function createRestoreWizardController(
  deps: RestoreWizardControllerDeps,
): RestoreWizardController {
  let state = createInitialRestoreWizardState();
  let preUpdateComplete: (() => void) | null = null;

  function notify(): void {
    deps.onStateChange?.();
  }

  function patch(partial: Partial<RestoreWizardState>): void {
    state = { ...state, ...partial };
    notify();
  }

  function finishPreUpdateFlow(): void {
    const complete = preUpdateComplete;
    preUpdateComplete = null;
    patch(createInitialRestoreWizardState());
    complete?.();
  }

  async function pickBackupFile(): Promise<boolean> {
    const picked = await deps.api.readPfbackupForValidate();
    if (picked.canceled) {
      if (state.mode === 'pre-update') {
        patch({
          phase: 'choose',
          busy: false,
          statusText: '',
          content: null,
          filePath: null,
          error: null,
          inspect: null,
          restoreResult: null,
        });
      } else {
        patch(createInitialRestoreWizardState());
      }
      return false;
    }
    patch({
      content: picked.content,
      filePath: picked.filePath,
      phase: 'inspect',
      busy: true,
      statusText: 'Backup wird geprüft …',
      error: null,
      inspect: null,
      restoreResult: null,
    });
    return true;
  }

  async function runInspect(): Promise<void> {
    if (!state.content) {
      patch({ error: 'Kein Backup-Inhalt.', phase: 'failed', busy: false });
      return;
    }
    try {
      const inspect = await deps.api.inspectPfbackup(state.content);
      patch({
        inspect,
        phase: inspect.ok && inspect.compatibility.restoreSupported ? 'preview' : 'failed',
        busy: false,
        statusText: '',
        error:
          inspect.ok && inspect.compatibility.restoreSupported
            ? null
            : restoreInspectError(inspect),
        restoreResult: null,
      });
    } catch (error) {
      patch({
        phase: 'failed',
        busy: false,
        statusText: '',
        error: error instanceof Error ? error.message : 'Backup-Prüfung fehlgeschlagen.',
      });
    }
  }

  async function pickAndInspect(): Promise<void> {
    try {
      if (await pickBackupFile()) await runInspect();
    } catch (error) {
      patch({
        phase: 'failed',
        busy: false,
        statusText: '',
        error: error instanceof Error ? error.message : 'Backup-Datei konnte nicht gelesen werden.',
      });
    }
  }

  function requestRestore(): void {
    if (state.busy || !state.inspect?.compatibility.restoreSupported) return;
    if (state.inspect.currentTlsClaimsHttps && state.inspect.backup?.tls?.inBackup) {
      patch({ phase: 'confirm-https' });
      return;
    }
    void runRestore();
  }

  async function runRestore(): Promise<void> {
    if (!state.content) {
      patch({ phase: 'failed', error: 'Kein Backup-Inhalt.', busy: false });
      return;
    }
    patch({
      phase: 'restoring',
      busy: true,
      statusText: 'Wiederherstellung läuft — Stack wird gestoppt und neu gestartet …',
      error: null,
      restoreResult: null,
    });
    try {
      const result = await deps.api.restorePfbackup(state.content, {
        skipProviderCredentials: state.skipProviderCredentials,
      });
      if (result.ok) {
        patch({
          phase: 'success',
          busy: false,
          statusText: '',
          restoreResult: result,
          error: null,
        });
        deps.onAfterMutation?.();
        return;
      }
      patch({
        phase: 'failed',
        busy: false,
        statusText: '',
        restoreResult: result,
        error: formatRestoreFailure(result),
        skipProviderCredentials: suggestCredentialSkipAfterRestoreFailure({
          inspect: state.inspect,
          restoreResult: result,
          skipProviderCredentials: state.skipProviderCredentials,
        })
          ? true
          : state.skipProviderCredentials,
      });
    } catch (error) {
      patch({
        phase: 'failed',
        busy: false,
        statusText: '',
        error: error instanceof Error ? error.message : 'Restore fehlgeschlagen.',
      });
    }
  }

  return {
    getState: () => state,

    openStandalone() {
      preUpdateComplete = null;
      state = {
        ...createInitialRestoreWizardState(),
        mode: 'standalone',
        phase: 'inspect',
        busy: true,
        statusText: 'Backup-Datei wählen …',
      };
      notify();
      void pickAndInspect();
    },

    openPreUpdate(onComplete) {
      preUpdateComplete = onComplete;
      patch({
        ...createInitialRestoreWizardState(),
        mode: 'pre-update',
        phase: 'choose',
      });
    },

    chooseRestore(restore) {
      if (!restore) {
        finishPreUpdateFlow();
        return;
      }
      patch({
        phase: 'inspect',
        busy: true,
        statusText: 'Backup-Datei wählen …',
        error: null,
      });
      void pickAndInspect();
    },

    confirmRestore() {
      if (state.busy) return;
      if (state.phase === 'confirm-https') void runRestore();
      else if (state.phase === 'preview') requestRestore();
    },
    cancelHttpsConfirmation() {
      if (state.phase === 'confirm-https') patch({ phase: 'preview' });
    },

    retryRestore() {
      if (canRetryRestoreAfterFailure(state.restoreResult)) requestRestore();
    },

    skipAfterFailure() {
      if (!canSkipRestoreAfterFailure(state.restoreResult)) {
        return;
      }
      if (state.mode === 'pre-update') {
        finishPreUpdateFlow();
        return;
      }
      patch(createInitialRestoreWizardState());
    },

    close() {
      if (state.mode === 'pre-update' && state.phase === 'success') {
        finishPreUpdateFlow();
        return;
      }
      preUpdateComplete = null;
      patch(createInitialRestoreWizardState());
    },

    setSkipProviderCredentials(value) {
      patch({ skipProviderCredentials: value });
    },
  };
}

function restoreInspectError(
  inspect: Awaited<ReturnType<PraxisManagerApi['inspectPfbackup']>>,
): string {
  return restoreInspectBlockedMessage(inspect) ?? 'Backup ist für Restore nicht geeignet.';
}

function formatRestoreFailure(
  result: Extract<Awaited<ReturnType<PraxisManagerApi['restorePfbackup']>>, { ok: false }>,
): string {
  const lines = [...result.errors];
  if (result.rollbackAttempted) {
    lines.push(
      result.rollbackSucceeded
        ? 'Automatischer Rollback wurde ausgeführt.'
        : 'Automatischer Rollback fehlgeschlagen.',
    );
  }
  return lines.join(' ');
}
