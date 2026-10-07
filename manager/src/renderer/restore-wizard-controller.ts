import { hasBlockingMaintenanceOperation } from '@wartezimmer/server-shared/manager-status-projection';
import type { HostStatus } from '../shared/host-status.js';
import type { WartezimmerManagerApi } from '../shared/wartezimmer-manager-api.js';
import {
  canRetryRestoreAfterFailure,
  canSkipRestoreAfterFailure,
  createInitialRestoreWizardState,
  restoreFailureSummary,
  restoreInspectBlockedMessage,
  shouldOfferCredentialSkip,
  type RestoreBackup,
  type RestoreWizardMode,
  type RestoreWizardState,
} from './restore-wizard-flow.js';

export type RestoreWizardControllerDeps = {
  api: WartezimmerManagerApi;
  /** Refresh the authoritative shell snapshot, including failed host operations. */
  refreshHost?: () => void | Promise<void>;
  getHostStatus?: () => HostStatus | null;
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
  abandonSession: () => void;
  setSkipProviderCredentials: (value: boolean) => void;
};

export function createRestoreWizardController(
  deps: RestoreWizardControllerDeps,
): RestoreWizardController {
  let state = createInitialRestoreWizardState();
  let generation = 0;
  let preUpdateComplete: (() => void) | null = null;
  const blocked = () => hasBlockingMaintenanceOperation(deps.getHostStatus?.());
  const refreshHost = () => (deps.refreshHost ? deps.refreshHost() : deps.api.fetchSetupStatus());
  function set(next: RestoreWizardState): void {
    state = next;
    deps.onStateChange?.();
  }
  function close(continueUpdate = false): void {
    const complete = continueUpdate && !blocked() ? preUpdateComplete : null;
    generation++;
    preUpdateComplete = null;
    set(createInitialRestoreWizardState());
    complete?.();
  }
  async function open(mode: RestoreWizardMode): Promise<void> {
    const session = ++generation;
    set({ phase: 'select', mode });
    try {
      await refreshHost();
      if (session !== generation) return;
      if (blocked()) {
        set({ phase: 'failed', mode, error: 'Offenen Hostvorgang zuerst klären.' });
        return;
      }
      if (mode === 'pre-update') set({ phase: 'choose', mode });
      else await pickAndInspect(mode, session);
    } catch (error) {
      if (session === generation)
        set({
          phase: 'failed',
          mode,
          error: message(error, 'Hoststatus konnte nicht geladen werden.'),
        });
    }
  }
  async function pickAndInspect(mode: RestoreWizardMode, session: number): Promise<void> {
    set({ phase: 'select', mode });
    try {
      const picked = await deps.api.selectPfbackupForRestore();
      if (session !== generation) return;
      if (picked.canceled) {
        if (mode === 'pre-update') set({ phase: 'choose', mode });
        else close();
        return;
      }
      set({ phase: 'inspect', mode, filePath: picked.filePath });
      const inspect = await deps.api.inspectPfbackup(picked.content);
      if (session !== generation) return;
      const error = restoreInspectBlockedMessage(inspect);
      if (!inspect.ok || !inspect.compatibility.restoreSupported)
        set({ phase: 'failed', mode, error: error || 'Backup ist für Restore nicht geeignet.' });
      else
        set({
          phase: 'preview',
          mode,
          backup: {
            content: picked.content,
            filePath: picked.filePath,
            inspect,
            draft: { skipProviderCredentials: false },
          },
        });
    } catch (error) {
      if (session === generation)
        set({
          phase: 'failed',
          mode,
          error: message(error, 'Backup-Datei konnte nicht geprüft werden.'),
        });
    }
  }
  function requestRestore(mode: RestoreWizardMode, backup: RestoreBackup): void {
    if (blocked()) return;
    if (backup.inspect.currentTlsClaimsHttps && backup.inspect.backup?.tls?.inBackup)
      set({ phase: 'confirm-https', mode, backup });
    else void runRestore(mode, backup);
  }
  async function runRestore(mode: RestoreWizardMode, backup: RestoreBackup): Promise<void> {
    if (blocked()) return;
    const session = generation;
    set({ phase: 'restoring', mode, backup });
    let completed: RestoreWizardState;
    try {
      const result = await deps.api.restorePfbackup(backup.content, backup.draft);
      completed = result.ok
        ? { phase: 'success', mode, restoreResult: result }
        : {
            phase: 'failed',
            mode,
            backup,
            restoreResult: result,
            error: restoreFailureSummary(result),
          };
    } catch (error) {
      completed = {
        phase: 'failed',
        mode,
        backup,
        error: message(error, 'Restore fehlgeschlagen.'),
      };
    } finally {
      // Even a departed UI session must reconcile the durable backend operation.
      try {
        await refreshHost();
      } catch {
        /* Shell owns status-fetch errors; preserve the mutation result. */
      }
    }
    if (session === generation) set(completed);
  }
  return {
    getState: () => state,
    openStandalone() {
      preUpdateComplete = null;
      void open('standalone');
    },
    openPreUpdate(onComplete) {
      preUpdateComplete = onComplete;
      void open('pre-update');
    },
    chooseRestore(restore) {
      if (state.phase !== 'choose' || blocked()) return;
      if (!restore) close(true);
      else void pickAndInspect(state.mode, generation);
    },
    confirmRestore() {
      if (state.phase === 'preview') requestRestore(state.mode, state.backup);
      else if (state.phase === 'confirm-https') void runRestore(state.mode, state.backup);
    },
    cancelHttpsConfirmation() {
      if (state.phase === 'confirm-https') set({ ...state, phase: 'preview' });
    },
    retryRestore() {
      if (
        state.phase === 'failed' &&
        state.backup &&
        canRetryRestoreAfterFailure(state.restoreResult ?? null)
      )
        requestRestore(state.mode, state.backup);
    },
    skipAfterFailure() {
      if (
        state.phase === 'failed' &&
        !blocked() &&
        canSkipRestoreAfterFailure(state.restoreResult ?? null)
      )
        close(state.mode === 'pre-update');
    },
    close() {
      close(state.phase === 'success' && state.mode === 'pre-update');
    },
    abandonSession() {
      close();
    },
    setSkipProviderCredentials(value) {
      if (
        (state.phase === 'preview' || state.phase === 'failed') &&
        state.backup &&
        shouldOfferCredentialSkip(state.backup.inspect)
      )
        set({ ...state, backup: { ...state.backup, draft: { skipProviderCredentials: value } } });
    },
  };
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
