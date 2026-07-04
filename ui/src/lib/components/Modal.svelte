<script lang="ts">
  import type { Snippet } from 'svelte';
  import { modalFocus } from '$lib/actions/modal-focus';
  import { portal } from '$lib/actions/portal';
  import { t } from '$lib/i18n/i18nStore.svelte';

  interface Props {
    open?: boolean;
    title?: string;
    ariaLabel?: string;
    showCloseButton?: boolean;
    maxWidth?: string;
    portalZIndex?: number;
    fullscreen?: boolean;
    closeOnBackdropClick?: boolean;
    closeOnEscape?: boolean;
    alignTop?: boolean;
    headerClass?: string;
    contentClass?: string;
    dimBackdrop?: boolean;
    onClose?: () => void;
    onDialogKeydown?: (event: KeyboardEvent) => void;
    header?: Snippet;
    children?: Snippet;
  }

  let {
    open = $bindable(false),
    title,
    ariaLabel,
    showCloseButton = true,
    maxWidth = '560px',
    portalZIndex = 1050,
    fullscreen = false,
    closeOnBackdropClick = false,
    closeOnEscape = true,
    alignTop = false,
    headerClass,
    contentClass,
    dimBackdrop = false,
    onClose,
    onDialogKeydown,
    header,
    children,
  }: Props = $props();

  function handleBackdropClick(event: MouseEvent) {
    if (closeOnBackdropClick && event.target === event.currentTarget) {
      handleClose();
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    onDialogKeydown?.(event);
    if (closeOnEscape && event.key === 'Escape') {
      handleClose();
    }
  }

  function handleClose() {
    if (!open) {
      return;
    }
    open = false;
    onClose?.();
  }

  $effect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    if (open) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => document.body.classList.remove('modal-open');
  });
</script>

{#if open}
  <div
    use:portal={portalZIndex}
    class="modal-backdrop {alignTop ? 'modal-backdrop--align-top' : ''} {dimBackdrop ? 'modal-backdrop--dimmed' : ''} {fullscreen ? 'modal-backdrop--fullscreen' : ''}"
    role="presentation"
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
  >
    <div
      class="modal-content {fullscreen ? 'modal-content--fullscreen' : ''} {contentClass ?? ''}"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
      aria-label={!title && ariaLabel ? ariaLabel : undefined}
      tabindex="-1"
      style={fullscreen ? undefined : `max-width: ${maxWidth};`}
      use:modalFocus={open}
    >
      {#if title || header}
        <div class="modal-header {headerClass ?? ''}">
          {#if header}
            {@render header()}
          {:else if title}
            <h2 id="modal-title" class="modal-title">{title}</h2>
          {/if}
          {#if showCloseButton}
            <button type="button" class="close-button" onclick={handleClose} aria-label={t('ui.dialogCloseAria')}>
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
    </div>
  </div>
{/if}
