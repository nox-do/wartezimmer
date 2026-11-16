<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { enterModalLayer } from '$lib/actions/modal-layer';
  import ToastContainer from '$lib/components/ToastContainer.svelte';
  import { t } from '$lib/i18n/i18nStore.svelte';

  interface Props {
    open?: boolean;
    title?: string;
    ariaLabel?: string;
    showCloseButton?: boolean;
    maxWidth?: string;
    fullscreen?: boolean;
    closeOnBackdropClick?: boolean;
    closeDisabled?: boolean;
    onCancel?: (event: Event) => void;
    alignTop?: boolean;
    headerClass?: string;
    contentClass?: string;
    dimBackdrop?: boolean;
    onClose?: () => void;
    onDialogKeydown?: (event: KeyboardEvent) => void;
    header?: Snippet<[string]>;
    children?: Snippet;
  }

  let {
    open = $bindable(false),
    title,
    ariaLabel,
    showCloseButton = true,
    maxWidth = '560px',
    fullscreen = false,
    closeOnBackdropClick = false,
    closeDisabled = false,
    onCancel,
    alignTop = false,
    headerClass,
    contentClass,
    dimBackdrop = false,
    onClose,
    onDialogKeydown,
    header,
    children,
  }: Props = $props();

  const id = $props.id();
  const titleId = `${id}-title`;
  let dialog = $state<HTMLDialogElement>(null!);
  let leaveLayer: (() => void) | undefined;
  let pressedOutside = false;

  function handleClose() {
    if (!closeDisabled) {
      dialog.close();
      syncClosed();
    }
  }

  function syncClosed() {
    // close events are queued: ignore an old event after a quick reopen.
    if (!dialog || !dialog.isConnected || dialog.open) return;
    // Some browsers can bypass a canceled close request on repeated Escape.
    // A pending action may only be closed by the owner's open=false update.
    if (open && closeDisabled) {
      dialog.showModal();
      return;
    }
    leaveLayer?.();
    leaveLayer = undefined;
    dialog.returnValue = '';
    if (open) {
      open = false;
      onClose?.();
    }
  }

  function handleCancel(event: Event) {
    if (event.target !== dialog) return;
    if (closeDisabled) {
      event.preventDefault();
      return;
    }
    onCancel?.(event);
  }

  function outside(event: PointerEvent) {
    const rect = dialog.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right ||
      event.clientY < rect.top || event.clientY > rect.bottom;
  }

  $effect(() => {
    if (open) {
      if (!dialog.open) {
        leaveLayer = enterModalLayer(dialog);
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
      // Controlled success/cleanup must not call the cancellation callback.
      syncClosed();
    }
  });

  onMount(() => {
    const element = dialog;
    return () => {
      element.close();
      leaveLayer?.();
    };
  });
</script>

<dialog
  bind:this={dialog}
  {id}
  class="modal-content {alignTop ? 'modal-content--align-top' : ''} {dimBackdrop ? 'modal-content--dimmed' : ''} {fullscreen ? 'modal-content--fullscreen' : ''} {contentClass ?? ''}"
  aria-labelledby={title || header ? titleId : undefined}
  aria-label={!title && !header ? ariaLabel : undefined}
  aria-busy={closeDisabled || undefined}
  closedby={closeDisabled ? 'none' : closeOnBackdropClick ? 'any' : 'closerequest'}
  style={fullscreen ? undefined : `max-width: ${maxWidth};`}
  oncancel={handleCancel}
  onclose={syncClosed}
  onkeydown={(event) => {
    if ((event.target as Element).closest('dialog') === dialog) onDialogKeydown?.(event);
  }}
  onpointerdown={(event) => { pressedOutside = event.target === dialog && outside(event); }}
  onpointerup={(event) => {
    // Safari lacks closedby. Require both ends outside; padding and selection drags stay safe.
    if (!('closedBy' in dialog) && closeOnBackdropClick && pressedOutside && outside(event)) handleClose();
    pressedOutside = false;
  }}
>
  {#if open}
    {#if title || header}
      <div class="modal-header {headerClass ?? ''}">
        {#if header}
          {@render header(titleId)}
        {:else if title}
          <h2 id={titleId} class="modal-title">{title}</h2>
        {/if}
        {#if showCloseButton}
          <button type="button" class="close-button" disabled={closeDisabled} onclick={handleClose} aria-label={t('ui.dialogCloseAria')}>
            <span aria-hidden="true">×</span>
          </button>
        {/if}
      </div>
    {/if}
    <div class="modal-body {fullscreen ? 'modal-body--fullscreen' : ''}">
      {#if children}
        {@render children()}
      {/if}
    </div>
    <ToastContainer modal={dialog} />
  {/if}
</dialog>
