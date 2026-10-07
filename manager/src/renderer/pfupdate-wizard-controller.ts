import { hasBlockingMaintenanceOperation } from '@wartezimmer/server-shared/manager-status-projection';
import { evaluateHostLifecycleAction } from '@wartezimmer/server-shared/host-lifecycle-policy';
import type { HostStatus, PfupdateApplyResult } from '../shared/host-status.js';
import type { WartezimmerManagerApi } from '../shared/wartezimmer-manager-api.js';
import {
  createInitialPfupdateWizardState,
  pfupdateInspectBlockedMessage,
  type PfupdateWizardState,
} from './pfupdate-wizard-flow.js';
import { formatPfupdateFailure } from './pfupdate-flow.js';

export type PfupdateWizardControllerDeps = {
  api: WartezimmerManagerApi;
  refreshHost?: () => void | Promise<void>;
  getHostStatus?: () => HostStatus | null;
  onApplySuccess?: (result: Extract<PfupdateApplyResult, { ok: true }>) => void;
  onStateChange?: () => void;
};
export type PfupdateWizardController = {
  getState: () => Readonly<PfupdateWizardState>;
  open: () => void;
  confirmApply: () => void;
  close: () => void;
};

export function createPfupdateWizardController(
  deps: PfupdateWizardControllerDeps,
): PfupdateWizardController {
  let state = createInitialPfupdateWizardState();
  let generation = 0;
  const blocked = () => hasBlockingMaintenanceOperation(deps.getHostStatus?.());
  const refreshHost = () => (deps.refreshHost ? deps.refreshHost() : deps.api.fetchSetupStatus());
  function set(next: PfupdateWizardState): void {
    state = next;
    deps.onStateChange?.();
  }
  async function open(): Promise<void> {
    const session = ++generation;
    set({ phase: 'select' });
    try {
      await refreshHost();
      if (session !== generation) return;
      if (blocked()) {
        set({ phase: 'failed', error: 'Offenen Hostvorgang zuerst klären.' });
        return;
      }
      const picked = await deps.api.selectPfupdateArchive();
      if (session !== generation) return;
      if (picked.canceled || !picked.path) {
        set({ phase: 'closed' });
        return;
      }
      set({ phase: 'inspect', filePath: picked.path });
      const inspect = await deps.api.inspectPfupdate({
        archivePath: picked.path,
        settingsFormatVersion: deps.getHostStatus?.()?.settingsFormatVersion,
      });
      if (session !== generation) return;
      const error = pfupdateInspectBlockedMessage(inspect);
      set(
        inspect.ok && inspect.compatibility.updateSupported
          ? { phase: 'preview', filePath: picked.path, inspect }
          : { phase: 'failed', error: error || 'Update-Paket ist nicht kompatibel.' },
      );
    } catch (error) {
      if (session === generation)
        set({
          phase: 'failed',
          error: message(error, 'Update-Paket konnte nicht geprüft werden.'),
        });
    }
  }
  async function apply(): Promise<void> {
    if (state.phase !== 'preview' || blocked()) return;
    const preview = state;
    const session = generation;
    const status = deps.getHostStatus?.();
    if (status?.lifecycle) {
      const decision = evaluateHostLifecycleAction(status.lifecycle, 'update');
      if (!decision.allowed) {
        set({ phase: 'failed', error: decision.reason ?? 'Host-Aktion derzeit nicht erlaubt.' });
        return;
      }
    }
    set({ ...preview, phase: 'applying' });
    let completed: PfupdateWizardState;
    try {
      const result = await deps.api.applyPfupdate({
        archivePath: preview.filePath,
        settingsFormatVersion: status?.settingsFormatVersion,
      });
      completed = result.ok
        ? { phase: 'success', applyResult: result }
        : { phase: 'failed', applyResult: result, error: formatPfupdateFailure(result) };
    } catch (error) {
      completed = { phase: 'failed', error: message(error, 'Software-Update fehlgeschlagen.') };
    } finally {
      try {
        await refreshHost();
      } catch {
        /* Shell owns refresh errors; keep the backend result. */
      }
    }
    if (session !== generation) return;
    set(completed);
    if (completed.phase === 'success') deps.onApplySuccess?.(completed.applyResult);
  }
  return {
    getState: () => state,
    open() {
      void open();
    },
    confirmApply() {
      void apply();
    },
    close() {
      generation++;
      set(createInitialPfupdateWizardState());
    },
  };
}
function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
