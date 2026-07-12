<script lang="ts">
  import {
    pfupdateApplyConfirmHint,
    pfupdateInspectBlockedMessage,
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
    onClose();
  }

  const inspectLines = $derived(
    snapshot.inspect ? pfupdateInspectSummaryLines(snapshot.inspect) : [],
  );
  const inspectWarnings = $derived(snapshot.inspect?.compatibility.warnings ?? []);
  const successText = $derived(
    snapshot.applyResult?.ok ? formatPfupdateSuccess(snapshot.applyResult) : '',
  );
</script>

<dialog
  bind:this={dialogEl}
  class="maintenance-dialog pfupdate-wizard-dialog"
  oncancel={(event) => {
    if (snapshot.busy) {
      event.preventDefault();
    }
  }}
  onclose={handleClose}
  onclick={(event) => {
    if (event.target === dialogEl && !snapshot.busy) {
      handleClose();
    }
  }}
>
  {#if snapshot.phase === 'inspect' || snapshot.phase === 'applying'}
    <h2>Software-Update</h2>
    <p class="wizard-progress is-active" role="status">
      <span class="spinner" aria-hidden="true"></span>
      {snapshot.statusText || 'Bitte warten …'}
    </p>
  {:else if snapshot.phase === 'preview' && snapshot.inspect}
    <h2>Update bestätigen</h2>
    {#if snapshot.filePath}
      <p class="hint">{snapshot.filePath}</p>
    {/if}
    <ul class="pfupdate-wizard-summary">
      {#each inspectLines as line (line)}
        <li>{line}</li>
      {/each}
    </ul>
    {#if inspectWarnings.length > 0}
      <div class="pfupdate-wizard-warnings">
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
      <button type="button" disabled={snapshot.busy} onclick={onConfirmApply}>
        Update einspielen
      </button>
      <button type="button" class="btn-secondary" disabled={snapshot.busy} onclick={handleClose}>
        Abbrechen
      </button>
    </div>
  {:else if snapshot.phase === 'success' && snapshot.applyResult?.ok}
    <h2>Update abgeschlossen</h2>
    <p>{successText}</p>
    <div class="actions-row actions-row--dialog">
      <button type="button" onclick={onClose}>Schließen</button>
    </div>
  {:else if snapshot.phase === 'failed'}
    <h2>Update fehlgeschlagen</h2>
    {#if snapshot.error}
      <p class="error">{snapshot.error}</p>
    {:else if snapshot.inspect}
      <p class="error">{pfupdateInspectBlockedMessage(snapshot.inspect)}</p>
    {/if}
    <div class="actions-row actions-row--dialog">
      <button type="button" class="btn-secondary" disabled={snapshot.busy} onclick={handleClose}>
        Schließen
      </button>
    </div>
  {/if}
</dialog>

<style>
  .pfupdate-wizard-summary {
    margin: 0.75rem 0;
    padding-left: 1.25rem;
  }

  .pfupdate-wizard-warnings {
    margin: 0.75rem 0;
    padding: 0.75rem;
    border-radius: 0.5rem;
    background: var(--surface-muted, rgba(0, 0, 0, 0.04));
  }
</style>
