<script lang="ts">
  import { toastStore, type Toast } from '$lib/stores/toastStore';
  import { topModal } from '$lib/actions/modal-layer';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import { fade, fly } from 'svelte/transition';

  type Placement = 'top-right' | 'bottom-right';

  interface Props {
    placement?: Placement;
    modal?: HTMLDialogElement;
  }

  let { placement = 'bottom-right', modal }: Props = $props();
  let toasts = $state<Toast[]>([]);

  $effect(() => {
    const unsubscribe = toastStore.subscribe((next) => {
      toasts = next;
    });
    return unsubscribe;
  });

  const icons: Record<string, string> = {
    success: '✓',
    info: 'ℹ',
    warning: '⚠',
    error: '✕',
  };

  function dismissToast(id: string) {
    toastStore.remove(id);
  }
</script>

{#if ($topModal ?? undefined) === modal}
  <div class="toast-container {placement}">
    {#each toasts as toast (toast.id)}
      <div
        class="toast {toast.type}"
        in:fly={{ x: 200, duration: modal ? 0 : 300, delay: modal ? 0 : 100 }}
        out:fade={{ duration: modal ? 0 : 200 }}
        role={modal ? (toast.type === 'error' ? 'alert' : 'status') : 'alertdialog'}
        aria-live={modal && toast.type !== 'error' ? 'polite' : 'assertive'}
        aria-labelledby={toast.title ? `toast-title-${modal?.id ?? 'global'}-${toast.id}` : undefined}
        aria-describedby="toast-message-{modal?.id ?? 'global'}-{toast.id}"
      >
        <div class="toast-content">
          <div class="toast-icon">{icons[toast.type] ?? 'ℹ'}</div>
          <div class="toast-text">
            {#if toast.title}
              <strong class="toast-title" id="toast-title-{modal?.id ?? 'global'}-{toast.id}">{toast.title}</strong>
            {/if}
            <p class="toast-message" id="toast-message-{modal?.id ?? 'global'}-{toast.id}">{toast.message}</p>
          </div>
          <button
            type="button"
            class="toast-close"
            aria-label={t('ui.toastCloseAria')}
            onclick={() => dismissToast(toast.id)}
          >
            ×
          </button>
        </div>
      </div>
    {/each}
  </div>

{/if}
