<script lang="ts">
  import Modal from '$lib/components/Modal.svelte';
  import Button from '$lib/components/forms/Button.svelte';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import type { PrivacyNotice } from '$lib/privacy/types';

  interface Props {
    open?: boolean;
    notice: PrivacyNotice | null;
    title?: string | null;
    paragraphs?: string[];
    closeLabelKey?: string;
    onClose?: () => void;
  }

  let {
    open = $bindable(false),
    notice,
    title = null,
    paragraphs = [],
    closeLabelKey = 'privacy.modalClose',
    onClose,
  }: Props = $props();

  const modalTitle = $derived(title ?? notice?.title ?? t('privacy.modalTitleFallback'));
  const modalParagraphs = $derived(
    paragraphs.length > 0 ? paragraphs : (notice?.paragraphs ?? []),
  );

  function handleClose() {
    open = false;
    onClose?.();
  }
</script>

<Modal
  bind:open
  title={modalTitle}
  maxWidth="520px"
  closeOnBackdropClick
  onClose={handleClose}
>
  {#if modalParagraphs.length > 0}
    <div class="privacy-notice-body">
      {#each modalParagraphs as paragraph, index (index)}
        <p>{paragraph}</p>
      {/each}
    </div>
  {:else}
    <p class="text-muted">{t('ui.loading')}</p>
  {/if}

  <div class="privacy-notice-actions">
    <Button variant="primary" fullWidth type="button" onclick={handleClose}>
      {t(closeLabelKey)}
    </Button>
  </div>
</Modal>

<style>
  .privacy-notice-body {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    font-size: 0.95rem;
    line-height: 1.5;
    margin: 0 0 1.25rem;
  }

  .privacy-notice-body p {
    margin: 0;
  }

  .privacy-notice-actions {
    margin-top: 0.25rem;
  }
</style>
