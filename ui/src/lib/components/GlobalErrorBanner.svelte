<script lang="ts">
  import { errorStore } from '$lib/stores/errorStore';
  import { t } from '$lib/i18n/i18nStore.svelte';
</script>

{#each $errorStore as error (error.id)}
  <div class="global-error-banner alert alert--error" role="alert">
    <span>{error.message}</span>
    <button
      type="button"
      class="global-error-banner__dismiss"
      aria-label={t('ui.dialogCloseAria')}
      onclick={() => errorStore.remove(error.id)}
    >
      ×
    </button>
  </div>
{/each}

<style>
  .global-error-banner {
    position: fixed;
    top: 0.75rem;
    left: 50%;
    z-index: 1100;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: min(640px, calc(100vw - 1.5rem));
    transform: translateX(-50%);
    margin: 0;
  }

  .global-error-banner__dismiss {
    margin-left: auto;
    border: none;
    background: transparent;
    font-size: 1.25rem;
    line-height: 1;
    cursor: pointer;
    color: inherit;
  }
</style>
