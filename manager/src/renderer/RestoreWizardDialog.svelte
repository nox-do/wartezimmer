<script lang="ts">
  import { hasBlockingMaintenanceOperation } from '@praxis-flow/server-shared/manager-status-projection';
  import { managerShell } from './manager-shell-state.svelte.js';
  import { managerStatusViewModel } from './manager-status-view-model.js';
  import {
    canRetryRestoreAfterFailure,
    canSkipRestoreAfterFailure,
    isRestoreRollbackFailed,
    restoreWizardIsBusy,
    restoreWizardProgress,
    restoreInspectSummaryLines,
    RESTORE_ROLLBACK_FAILED_RECOVERY_MESSAGE,
    restoreSuccessSummary,
    restoreWizardChooseLead,
    restoreWizardChooseTitle,
    shouldOfferCredentialSkip,
    type RestoreWizardState,
  } from './restore-wizard-flow.js';

  let {
    snapshot,
    onChooseRestore,
    onConfirmRestore,
    onCancelHttps,
    onRetry,
    onSkip,
    onClose,
    onToggleCredentialSkip,
  }: {
    snapshot: RestoreWizardState;
    onChooseRestore: (restore: boolean) => void;
    onConfirmRestore: () => void;
    onCancelHttps: () => void;
    onRetry: () => void;
    onSkip: () => void;
    onClose: () => void;
    onToggleCredentialSkip: (value: boolean) => void;
  } = $props();

  const blocked = $derived(hasBlockingMaintenanceOperation(managerShell.configSnapshot));
  const diagnosis = $derived(managerStatusViewModel(managerShell.configSnapshot, managerShell.runtimeObservation));
  const busy = $derived(restoreWizardIsBusy(snapshot));
  const backup = $derived('backup' in snapshot ? snapshot.backup : undefined);
  const mode = $derived('mode' in snapshot ? snapshot.mode : 'standalone');
  const result = $derived('restoreResult' in snapshot ? snapshot.restoreResult ?? null : null);
  const open = $derived(snapshot.phase !== 'closed');
  let dialogEl = $state<HTMLDialogElement | null>(null);

  $effect(() => {
    if (!dialogEl) {
      return;
    }
    if (open && !dialogEl.open) {
      dialogEl.showModal();
      return;
    }
    if (!open && dialogEl.open) {
      dialogEl.close();
    }
  });

  function handleClose(): void {
    if (busy) {
      return;
    }
    if (snapshot.phase === 'confirm-https') onCancelHttps();
    else onClose();
  }

  const inspectLines = $derived(
    backup?.inspect ? restoreInspectSummaryLines(backup?.inspect) : [],
  );
  const inspectWarnings = $derived(backup?.inspect?.compatibility.warnings ?? []);
  const rollbackFailed = $derived(isRestoreRollbackFailed(result));
  const showRetry = $derived(canRetryRestoreAfterFailure(result));
  const showSkip = $derived(
    mode === 'pre-update' && canSkipRestoreAfterFailure(result),
  );
  const showCredentialSkip = $derived(
    shouldOfferCredentialSkip(backup?.inspect),
  );
</script>

<dialog
  bind:this={dialogEl}
  class="maintenance-dialog restore-wizard-dialog"
  aria-busy={busy}
  oncancel={(event) => {
    event.preventDefault();
    handleClose();
  }}
  onclose={handleClose}
  onclick={(event) => {
    if (event.target === dialogEl && !busy) {
      handleClose();
    }
  }}
>
  {#if blocked && !busy}
    <p class={diagnosis.noticeClass}>{diagnosis.primary.summary}</p>
    <p>{diagnosis.primary.detail}</p>
    <button type="button" class="btn-secondary" onclick={onClose}>Schließen</button>
  {:else if snapshot.phase === 'choose'}
    <h2>{restoreWizardChooseTitle(mode)}</h2>
    <p>{restoreWizardChooseLead(mode)}</p>
    <div class="actions-row actions-row--dialog">
      <button type="button" disabled={busy} onclick={() => onChooseRestore(true)}>
        Ja, Backup wiederherstellen
      </button>
      <button
        type="button"
        class="btn-secondary"
        disabled={busy}
        onclick={() => onChooseRestore(false)}
      >
        {mode === 'pre-update' ? 'Nein, Update ohne Restore' : 'Abbrechen'}
      </button>
    </div>
  {:else if snapshot.phase === 'select' || snapshot.phase === 'inspect' || snapshot.phase === 'restoring'}
    <h2>Einstellungen wiederherstellen</h2>
    <p class="wizard-progress is-active" role="status">
      <span class="spinner" aria-hidden="true"></span>
      {restoreWizardProgress(snapshot) || 'Bitte warten …'}
    </p>
  {:else if snapshot.phase === 'confirm-https'}
    <h2>HTTPS-Einrichtung ersetzen?</h2>
    <p>
      HTTPS ist auf diesem Computer aktiv. Wiederherstellen ersetzt die aktuelle
      HTTPS-Einrichtung durch die Sicherung.
    </p>
    <div class="actions-row actions-row--dialog">
      <button type="button" onclick={onConfirmRestore}>HTTPS ersetzen und wiederherstellen</button>
      <button type="button" class="btn-secondary" onclick={onCancelHttps}>Abbrechen</button>
    </div>
  {:else if snapshot.phase === 'preview' && backup?.inspect}
    <h2>Restore bestätigen</h2>
    {#if backup?.filePath}
      <p class="hint">{backup?.filePath}</p>
    {/if}
    <ul class="wizard-dialog-summary">
      {#each inspectLines as line (line)}
        <li>{line}</li>
      {/each}
    </ul>
    {#if inspectWarnings.length > 0}
      <div class="wizard-dialog-warnings">
        <p><strong>Hinweise</strong></p>
        <ul>
          {#each inspectWarnings as warning (warning)}
            <li>{warning}</li>
          {/each}
        </ul>
      </div>
    {/if}
    {#if showCredentialSkip}
      <label class="restore-wizard-checkbox">
        <input
          type="checkbox"
          checked={backup?.draft.skipProviderCredentials}
          disabled={busy}
          onchange={(event) => onToggleCredentialSkip(event.currentTarget.checked)}
        />
        SMS-Zugangsdaten nicht übernehmen (SMS anschließend neu einrichten)
      </label>
    {/if}
    <p class="hint">
      Praxis Flow wird angehalten und die gesicherten Einstellungen werden übernommen.
      Die aktuelle Warteschlange und die darin gespeicherten Patientendaten werden gelöscht.
      Terminal und Anmeldung sind währenddessen nicht verfügbar.
    </p>
    <div class="actions-row actions-row--dialog">
      <button type="button" disabled={busy} onclick={onConfirmRestore}>
        Wiederherstellen
      </button>
      <button type="button" class="btn-secondary" disabled={busy} onclick={handleClose}>
        Abbrechen
      </button>
    </div>
  {:else if snapshot.phase === 'success'}
    <h2>Wiederherstellung abgeschlossen</h2>
    <p>{restoreSuccessSummary(snapshot.restoreResult)}</p>
    <div class="actions-row actions-row--dialog">
      <button type="button" onclick={onClose}>Schließen</button>
    </div>
  {:else if snapshot.phase === 'failed'}
    <h2>Restore fehlgeschlagen</h2>
    {#if backup?.inspect && inspectLines.length > 0}
      <ul class="wizard-dialog-summary">
        {#each inspectLines as line (line)}
          <li>{line}</li>
        {/each}
      </ul>
    {/if}
    {#if rollbackFailed}
      <p class="error">{RESTORE_ROLLBACK_FAILED_RECOVERY_MESSAGE}</p>
      {#if snapshot.error}
        <p class="hint">{snapshot.error}</p>
      {/if}
      <div class="actions-row actions-row--dialog">
        <button type="button" disabled={busy} onclick={handleClose}>
          Schließen
        </button>
      </div>
    {:else}
      {#if snapshot.error}
        <p class="error">{snapshot.error}</p>

      {/if}
      {#if showCredentialSkip}
        <label class="restore-wizard-checkbox">
          <input
            type="checkbox"
            checked={backup?.draft.skipProviderCredentials}
            disabled={busy}
            onchange={(event) => onToggleCredentialSkip(event.currentTarget.checked)}
          />
          SMS-Zugangsdaten nicht übernehmen (SMS anschließend neu einrichten)
        </label>
        <p class="hint">
          Wenn der Restore an Provider-Zugangsdaten scheiterte, können Sie den
          Import ohne SMS-Credentials erneut versuchen und Provider später in Ops neu eintragen.
        </p>
      {/if}
      <div class="actions-row actions-row--dialog">
        {#if showRetry}
          <button type="button" disabled={busy} onclick={onRetry}>
            Erneut versuchen
          </button>
        {/if}
        {#if showSkip}
          <button type="button" class="btn-secondary" disabled={busy} onclick={onSkip}>
            Restore überspringen und fortfahren
          </button>
        {:else if mode !== 'pre-update'}
          <button type="button" class="btn-secondary" disabled={busy} onclick={handleClose}>
            Schließen
          </button>
        {/if}
      </div>
    {/if}
  {/if}
</dialog>

<style>
  .restore-wizard-checkbox {
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
    margin: 0.75rem 0;
  }
</style>
