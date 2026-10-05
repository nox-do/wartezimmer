<script lang="ts">
  import { hasBlockingMaintenanceOperation } from '@praxis-flow/server-shared/manager-status-projection';
  import { managerShell } from './manager-shell-state.svelte.js';
  import { managerStatusViewModel } from './manager-status-view-model.js';
  import {
    pfupdateApplyConfirmHint,
    pfupdateWizardIsBusy,
    pfupdateWizardProgress,
    pfupdateInspectSummaryLines,
    type PfupdateWizardState,
  } from './pfupdate-wizard-flow.js';
  import { formatPfupdateSuccess } from './pfupdate-flow.js';

  let {
    snapshot,
    onConfirmApply,
    onClose,
  }: {
    snapshot: PfupdateWizardState;
    onConfirmApply: () => void;
    onClose: () => void;
  } = $props();

  const blocked = $derived(hasBlockingMaintenanceOperation(managerShell.configSnapshot));
  const diagnosis = $derived(managerStatusViewModel(managerShell.configSnapshot, managerShell.runtimeObservation));
  const busy = $derived(pfupdateWizardIsBusy(snapshot));
  const inspect = $derived('inspect' in snapshot ? snapshot.inspect : undefined);
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
    onClose();
  }

  const inspectLines = $derived(
    inspect ? pfupdateInspectSummaryLines(inspect) : [],
  );
  const inspectWarnings = $derived(inspect?.compatibility.warnings ?? []);
  const successText = $derived(
    snapshot.phase === 'success' ? formatPfupdateSuccess(snapshot.applyResult) : '',
  );
</script>

<dialog
  bind:this={dialogEl}
  class="maintenance-dialog pfupdate-wizard-dialog"
  aria-busy={busy}
  oncancel={(event) => {
    if (busy) {
      event.preventDefault();
    }
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
  {:else if snapshot.phase === 'select' || snapshot.phase === 'inspect' || snapshot.phase === 'applying'}
    <h2>Software-Update</h2>
    <p class="wizard-progress is-active" role="status">
      <span class="spinner" aria-hidden="true"></span>
      {pfupdateWizardProgress(snapshot) || 'Bitte warten …'}
    </p>
  {:else if snapshot.phase === 'preview' && inspect}
    <h2>Update bestätigen</h2>
    {#if snapshot.filePath}
      <p class="hint">{snapshot.filePath}</p>
    {/if}
    <ul class="wizard-dialog-summary">
      {#each inspectLines as line (line)}
        <li>{line}</li>
      {/each}
    </ul>
    {#if inspect.package}
      <details>
        <summary>Technische Paketdetails</summary>
        <p>Unterstützte Einstellungsformate: {inspect.package.supportedSettingsFormatVersions.join(', ')}</p>
        <p>Datenbankschema nach dem Update: {inspect.package.targetSchemaVersion}</p>
      </details>
    {/if}
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
    <p class="hint">{pfupdateApplyConfirmHint()}</p>
    <div class="actions-row actions-row--dialog">
      <button type="button" disabled={busy} onclick={onConfirmApply}>
        Update einspielen
      </button>
      <button type="button" class="btn-secondary" disabled={busy} onclick={handleClose}>
        Abbrechen
      </button>
    </div>
  {:else if snapshot.phase === 'success'}
    <h2>Update abgeschlossen</h2>
    <p>{successText}</p>
    <div class="actions-row actions-row--dialog">
      <button type="button" onclick={onClose}>Schließen</button>
    </div>
  {:else if snapshot.phase === 'failed'}
    <h2>Update fehlgeschlagen</h2>
    {#if snapshot.error}
      <p class="error">{snapshot.error}</p>

    {/if}
    <div class="actions-row actions-row--dialog">
      <button type="button" class="btn-secondary" disabled={busy} onclick={handleClose}>
        Schließen
      </button>
    </div>
  {/if}
</dialog>
