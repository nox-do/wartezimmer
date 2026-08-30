<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    open = false,
    confirmLabel = 'Fortfahren',
    cancelLabel = 'Abbrechen',
    onConfirm,
    onCancel,
    children,
  }: {
    open?: boolean;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
    children?: Snippet;
  } = $props();

  let dialogEl = $state<HTMLDialogElement | null>(null);
  let ignoreNextClose = false;

  $effect(() => {
    if (!dialogEl) {
      return;
    }
    if (open && !dialogEl.open) {
      dialogEl.showModal();
      return;
    }
    if (!open && dialogEl.open) {
      ignoreNextClose = true;
      dialogEl.close();
    }
  });

  function handleCancel(): void {
    onCancel();
  }

  function handleConfirm(): void {
    onConfirm();
  }

  function handleClose(): void {
    if (ignoreNextClose) {
      ignoreNextClose = false;
      return;
    }
    handleCancel();
  }
</script>

<dialog
  bind:this={dialogEl}
  class="maintenance-dialog"
  onclose={handleClose}
  onclick={(event) => {
    if (event.target === dialogEl) {
      handleCancel();
    }
  }}
>
  {#if children}
    {@render children()}
  {/if}
  <div class="actions-row actions-row--dialog">
    <button type="button" onclick={handleConfirm}>{confirmLabel}</button>
    <button type="button" class="btn-secondary" onclick={handleCancel}>{cancelLabel}</button>
  </div>
</dialog>
