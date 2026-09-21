<script lang="ts">
  import {
    canRetryRestoreAfterFailure,
    canSkipRestoreAfterFailure,
    isRestoreRollbackFailed,
    restoreInspectBlockedMessage,
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
    if (snapshot.busy) {
      return;
    }
    if (snapshot.phase === 'confirm-https') onCancelHttps();
    else onClose();
  }

  const inspectLines = $derived(
    snapshot.inspect ? restoreInspectSummaryLines(snapshot.inspect) : [],
  );
  const inspectWarnings = $derived(snapshot.inspect?.compatibility.warnings ?? []);
  const rollbackFailed = $derived(isRestoreRollbackFailed(snapshot.restoreResult));
  const showRetry = $derived(canRetryRestoreAfterFailure(snapshot.restoreResult));
  const showSkip = $derived(
    snapshot.mode === 'pre-update' && canSkipRestoreAfterFailure(snapshot.restoreResult),
  );
  const showCredentialSkip = $derived(
    shouldOfferCredentialSkip({
      inspect: snapshot.inspect,
      restoreResult: snapshot.restoreResult,
    }),
  );
</script>

<dialog
  bind:this={dialogEl}
  class="maintenance-dialog restore-wizard-dialog"
  oncancel={(event) => {
    event.preventDefault();
    handleClose();
  }}
  onclose={handleClose}
  onclick={(event) => {
    if (event.target === dialogEl && !snapshot.busy) {
      handleClose();
    }
  }}
>
  {#if snapshot.phase === 'choose'}
    <h2>{restoreWizardChooseTitle(snapshot.mode)}</h2>
    <p>{restoreWizardChooseLead(snapshot.mode)}</p>
    <div class="actions-row actions-row--dialog">
      <button type="button" disabled={snapshot.busy} onclick={() => onChooseRestore(true)}>
        Ja, Backup wiederherstellen
      </button>
      <button
        type="button"
        class="btn-secondary"
        disabled={snapshot.busy}
        onclick={() => onChooseRestore(false)}
      >
        {snapshot.mode === 'pre-update' ? 'Nein, Update ohne Restore' : 'Abbrechen'}
      </button>
    </div>
  {:else if snapshot.phase === 'inspect' || snapshot.phase === 'restoring'}
    <h2>Settings wiederherstellen</h2>
    <p class="wizard-progress is-active" role="status">
      <span class="spinner" aria-hidden="true"></span>
      {snapshot.statusText || 'Bitte warten …'}
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
  {:else if snapshot.phase === 'preview' && snapshot.inspect}
    <h2>Restore bestätigen</h2>
    <p class="hint">
      Diese Sicherung ist nicht verschlüsselt. API-Schlüssel für SMS und WhatsApp werden im
      Klartext mitgesichert. Bei HTTPS kann sie private Schlüssel enthalten. Bewahren Sie die
      Datei geschützt auf, möglichst auf einem verschlüsselten Datenträger, und geben Sie sie
      nicht ungeschützt weiter.
    </p>
    {#if snapshot.filePath}
      <p class="hint">{snapshot.filePath}</p>
    {/if}
    <ul class="restore-wizard-summary">
      {#each inspectLines as line (line)}
        <li>{line}</li>
      {/each}
    </ul>
    {#if inspectWarnings.length > 0}
      <div class="restore-wizard-warnings">
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
          checked={snapshot.skipProviderCredentials}
          disabled={snapshot.busy}
          onchange={(event) => onToggleCredentialSkip(event.currentTarget.checked)}
        />
        Provider-Credentials nicht importieren (SMS neu konfigurieren)
      </label>
    {/if}
    <p class="hint">
      Der Stack wird gestoppt, die Runtime-DB verworfen und Settings importiert. Terminal und MFA
      sind kurz offline.
    </p>
    <div class="actions-row actions-row--dialog">
      <button type="button" disabled={snapshot.busy} onclick={onConfirmRestore}>
        Wiederherstellen
      </button>
      <button type="button" class="btn-secondary" disabled={snapshot.busy} onclick={handleClose}>
        Abbrechen
      </button>
    </div>
  {:else if snapshot.phase === 'success' && snapshot.restoreResult?.ok}
    <h2>Wiederherstellung abgeschlossen</h2>
    <p>{restoreSuccessSummary(snapshot.restoreResult)}</p>
    <div class="actions-row actions-row--dialog">
      <button type="button" onclick={onClose}>Schließen</button>
    </div>
  {:else if snapshot.phase === 'failed'}
    <h2>Restore fehlgeschlagen</h2>
    {#if snapshot.inspect && inspectLines.length > 0}
      <ul class="restore-wizard-summary">
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
        <button type="button" disabled={snapshot.busy} onclick={handleClose}>
          Schließen
        </button>
      </div>
    {:else}
      {#if snapshot.error}
        <p class="error">{snapshot.error}</p>
      {:else if snapshot.inspect}
        <p class="error">{restoreInspectBlockedMessage(snapshot.inspect)}</p>
      {/if}
      {#if showCredentialSkip}
        <label class="restore-wizard-checkbox">
          <input
            type="checkbox"
            checked={snapshot.skipProviderCredentials}
            disabled={snapshot.busy}
            onchange={(event) => onToggleCredentialSkip(event.currentTarget.checked)}
          />
          Provider-Credentials nicht importieren (SMS neu konfigurieren)
        </label>
        <p class="hint">
          Wenn der Restore an Provider-Zugangsdaten scheiterte, können Sie den
          Import ohne SMS-Credentials erneut versuchen und Provider später in Ops neu eintragen.
        </p>
      {/if}
      <div class="actions-row actions-row--dialog">
        {#if showRetry}
          <button type="button" disabled={snapshot.busy} onclick={onRetry}>
            Erneut versuchen
          </button>
        {/if}
        {#if showSkip}
          <button type="button" class="btn-secondary" disabled={snapshot.busy} onclick={onSkip}>
            Restore überspringen und fortfahren
          </button>
        {:else if snapshot.mode !== 'pre-update'}
          <button type="button" class="btn-secondary" disabled={snapshot.busy} onclick={handleClose}>
            Schließen
          </button>
        {/if}
      </div>
    {/if}
  {/if}
</dialog>

<style>
  .restore-wizard-summary {
    margin: 0.75rem 0;
    padding-left: 1.25rem;
  }

  .restore-wizard-warnings {
    margin: 0.75rem 0;
    padding: 0.75rem;
    border-radius: 0.5rem;
    background: var(--surface-muted, rgba(0, 0, 0, 0.04));
  }

  .restore-wizard-checkbox {
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
    margin: 0.75rem 0;
  }
</style>
