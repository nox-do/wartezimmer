<script lang="ts">
  import { toastStore, type Toast } from '$lib/stores/toastStore';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import { fade, fly } from 'svelte/transition';

  type Placement = 'top-right' | 'bottom-right';

  interface Props {
    placement?: Placement;
  }

  let { placement = 'bottom-right' }: Props = $props();
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

<div class="toast-container {placement}">
  {#each toasts as toast (toast.id)}
    <div
      class="toast {toast.type}"
      in:fly={{ x: 200, duration: 300, delay: 100 }}
      out:fade={{ duration: 200 }}
      role="alertdialog"
      aria-live="assertive"
      aria-labelledby="toast-title-{toast.id}"
      aria-describedby="toast-message-{toast.id}"
    >
      <div class="toast-content">
        <div class="toast-icon">{icons[toast.type] ?? 'ℹ'}</div>
        <div class="toast-text">
          {#if toast.title}
            <strong class="toast-title" id="toast-title-{toast.id}">{toast.title}</strong>
          {/if}
          <p class="toast-message" id="toast-message-{toast.id}">{toast.message}</p>
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
