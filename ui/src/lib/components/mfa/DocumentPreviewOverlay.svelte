<script lang="ts">
  import '$lib/styles/mfa-document-preview.css';
  import { ChevronLeft, ChevronRight, Pencil, X } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import Button from '$lib/components/forms/Button.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import { discardDocument, exportDocument, fetchDocumentsForTicket, previewDocument, renameDocument } from '$lib/documents/document-api';
  import { resolveSandboxEmbedUrl } from '$lib/documents/resolve-embed-url';
  import { previewSandboxStatusMessage } from '$lib/documents/preview-sandbox-status';
  import { splitFileName } from '$lib/documents/split-file-name';
  import type { MfaDocument, MfaDocumentPreview } from '$lib/documents/types';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import {
    captureRenameGeneration,
    invalidateDocumentRename,
    isRenameGenerationCurrent,
  } from '$lib/mfa/mfa-document-preview.svelte';
  import { type MfaPreviewContext } from '$lib/mfa/document-context';
  import { formatTicketCode } from '@praxis-flow/domain';
  import { getTopicLabel } from '$lib/queue/practice-catalog';
  import { toastStore } from '$lib/stores/toastStore';

  interface Props {
    open?: boolean;
    context: MfaPreviewContext;
    initialItems?: MfaDocument[];
    onClose?: () => void;
    onDocumentsChanged?: () => void;
  }

  let { open = $bindable(true), context, initialItems, onClose, onDocumentsChanged }: Props = $props();

  let items = $state<MfaDocument[]>([]);
  let activeDocumentId = $state('');
  let previewLoading = $state(false);
  let listLoading = $state(true);
  let activePreview = $state<MfaDocumentPreview | null>(null);
  let busyAction = $state<'export' | 'discard' | 'rename' | null>(null);
  let renameEditing = $state(false);
  let renameDraft = $state('');
  let renameInputEl = $state<HTMLInputElement | null>(null);
  let previewRequestSeq = 0;

  const activeContext = $derived({ ...context, activeDocumentId });
  const activeIndex = $derived(
    activeDocumentId ? items.findIndex((item) => item.id === activeDocumentId) : -1,
  );
  const activeDocument = $derived(activeIndex >= 0 ? items[activeIndex] : null);
  const fileNameParts = $derived(
    activeDocument ? splitFileName(activeDocument.fileName) : { base: '', extension: '' },
  );
  const embedSrc = $derived(resolveSandboxEmbedUrl(activePreview?.preview?.embedUrl));
  const previewStatusKey = $derived(previewSandboxStatusMessage(activePreview?.preview?.status));
  const showPreviewFrame = $derived(Boolean(embedSrc && !previewStatusKey));
  const canGoPrev = $derived(activeIndex > 0);
  const canGoNext = $derived(activeIndex >= 0 && activeIndex < items.length - 1);
  const canExport = $derived(activeDocument?.status === 'preview_requested');
  const canRename = $derived(activeDocument?.status === 'preview_requested');
  const ticketLabel = $derived(formatTicketCode(context.laneCode, context.number));
  const topicLabel = $derived(getTopicLabel(context.topicId, context.topicLabel));

  function handleClose() {
    if (!open) {
      return;
    }
    cancelRename();
    open = false;
    onClose?.();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      if (renameEditing) {
        cancelRename();
        return;
      }
      handleClose();
      return;
    }
    if (busyAction != null || previewLoading || listLoading || renameEditing) {
      return;
    }
    if (event.key === 'ArrowLeft' && canGoPrev) {
      event.preventDefault();
      void switchDocument(activeIndex - 1);
    }
    if (event.key === 'ArrowRight' && canGoNext) {
      event.preventDefault();
      void switchDocument(activeIndex + 1);
    }
  }

  function syncActiveDocumentId() {
    if (!items.some((item) => item.id === activeDocumentId)) {
      activeDocumentId = items[0]?.id ?? '';
    }
  }

  function pickDocumentIdAfterRemoval(
    previousItems: MfaDocument[],
    nextItems: MfaDocument[],
    removedId: string,
  ): string {
    if (nextItems.length === 0) {
      return '';
    }
    const removedIndex = previousItems.findIndex((item) => item.id === removedId);
    if (removedIndex < 0) {
      return nextItems[0]!.id;
    }
    const nextIndex = Math.min(removedIndex, nextItems.length - 1);
    return nextItems[nextIndex]!.id;
  }

  function applyActiveDocumentId(nextId: string) {
    activeDocumentId = nextId;
  }

  function applyPreviewToItems(preview: MfaDocumentPreview) {
    items = items.map((item) => (item.id === preview.id ? { ...item, status: preview.status } : item));
  }

  async function loadDocuments(options?: { afterRemovedId?: string; previousItems?: MfaDocument[] }) {
    listLoading = true;
    const result = await fetchDocumentsForTicket(activeContext.ticketId);
    listLoading = false;

    if (!result.ok) {
      toastStore.error(result.error.message || t('mfa.documentsLoadError'));
      handleClose();
      return false;
    }

    items = result.data.items ?? [];
    onDocumentsChanged?.();

    if (items.length === 0) {
      handleClose();
      return false;
    }

    if (options?.afterRemovedId && options.previousItems) {
      applyActiveDocumentId(
        pickDocumentIdAfterRemoval(options.previousItems, items, options.afterRemovedId),
      );
    } else {
      syncActiveDocumentId();
    }
    return true;
  }

  async function loadPreviewForActive() {
    if (!activeDocument) {
      activePreview = null;
      return;
    }

    const requestId = ++previewRequestSeq;
    previewLoading = true;
    activePreview = null;

    const result = await previewDocument(activeDocument.id);
    if (requestId !== previewRequestSeq) {
      return;
    }
    previewLoading = false;

    if (!result.ok) {
      toastStore.error(result.error.message);
      return;
    }

    activePreview = result.data;
    applyPreviewToItems(result.data);
    if (result.data.preview?.status === 'blocked_malware' || result.data.status === 'discarded_by_mfa') {
      toastStore.error(t('mfa.previewBlockedMalware'));
      activePreview = null;
      const blockedId = activeDocument.id;
      const previousItems = [...items];
      const loaded = await loadDocuments({ afterRemovedId: blockedId, previousItems });
      if (loaded) {
        await loadPreviewForActive();
      }
      return;
    }
  }

  function cancelRename() {
    invalidateDocumentRename();
    renameEditing = false;
    renameDraft = '';
  }

  function finishRenameEdit() {
    renameEditing = false;
    renameDraft = '';
  }

  function startRename() {
    if (!activeDocument || !canRename || busyAction != null || previewLoading || listLoading) {
      return;
    }
    renameDraft = fileNameParts.base;
    renameEditing = true;
    queueMicrotask(() => {
      renameInputEl?.focus();
      renameInputEl?.select();
    });
  }

  async function commitRename() {
    if (!activeDocument || !renameEditing || busyAction === 'rename') {
      return;
    }

    const trimmed = renameDraft.trim();
    if (!trimmed) {
      toastStore.error(t('mfa.documentRenameEmpty'));
      renameInputEl?.focus();
      return;
    }

    if (trimmed === fileNameParts.base) {
      cancelRename();
      return;
    }

    const commitId = captureRenameGeneration();
    const documentId = activeDocument.id;
    busyAction = 'rename';
    const result = await renameDocument(documentId, trimmed);
    busyAction = null;

    if (!isRenameGenerationCurrent(commitId)) {
      return;
    }

    if (!result.ok) {
      toastStore.error(result.error.message);
      renameInputEl?.focus();
      return;
    }

    items = items.map((item) =>
      item.id === result.data.id ? { ...item, fileName: result.data.fileName } : item,
    );
    onDocumentsChanged?.();
    toastStore.success(t('mfa.documentRenamed'));
    finishRenameEdit();
  }

  function handleRenameKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      void commitRename();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancelRename();
    }
  }

  async function switchDocument(nextIndex: number) {
    cancelRename();
    const next = items[nextIndex];
    if (!next) {
      return;
    }
    activeDocumentId = next.id;
    await loadPreviewForActive();
  }

  async function onExport() {
    if (!activeDocument || !canExport) {
      return;
    }
    if (renameEditing) {
      await commitRename();
      if (renameEditing) {
        return;
      }
    }

    busyAction = 'export';
    const result = await exportDocument(activeDocument.id);
    busyAction = null;

    if (!result.ok) {
      toastStore.error(result.error.message);
      await loadDocuments();
      return;
    }

    if (result.data.status !== 'exported') {
      toastStore.error(t('mfa.documentExportFailed'));
      await loadDocuments();
      return;
    }

    toastStore.success(t('mfa.documentExported'));
    const exportedId = activeDocument.id;
    const previousItems = [...items];
    await loadDocuments({ afterRemovedId: exportedId, previousItems });
    if (items.length === 0) {
      handleClose();
      return;
    }
    await loadPreviewForActive();
  }

  async function onDiscard() {
    if (!activeDocument) {
      return;
    }
    if (renameEditing) {
      cancelRename();
    }

    busyAction = 'discard';
    const result = await discardDocument(activeDocument.id);
    busyAction = null;

    if (!result.ok) {
      toastStore.error(result.error.message);
      return;
    }

    toastStore.success(t('mfa.documentDiscarded'));
    const discardedId = activeDocument.id;
    const previousItems = [...items];
    await loadDocuments({ afterRemovedId: discardedId, previousItems });
    if (items.length === 0) {
      handleClose();
      return;
    }
    await loadPreviewForActive();
  }

  $effect(() => {
    const nextId = context.activeDocumentId;
    if (nextId) {
      activeDocumentId = nextId;
    }
  });

  onMount(() => {
    void (async () => {
      const seeded = initialItems?.length ? [...initialItems] : null;
      if (seeded) {
        items = seeded;
        listLoading = false;
        syncActiveDocumentId();
      } else {
        const loaded = await loadDocuments();
        if (!loaded) {
          return;
        }
      }

      if (open && items.length > 0) {
        await loadPreviewForActive();
      }
    })();
  });
</script>

<Modal
  bind:open
  fullscreen
  portalZIndex={1100}
  ariaLabel={t('mfa.previewTitle')}
  contentClass="doc-preview-shell"
  closeOnBackdropClick={false}
  closeOnEscape={false}
  showCloseButton={false}
  onClose={() => onClose?.()}
  onDialogKeydown={handleKeydown}
>
  <header class="doc-preview-toolbar">
    <div class="doc-preview-toolbar-start">
      <span class="doc-preview-ticket">{ticketLabel} · {topicLabel}</span>

      {#if activeDocument && !listLoading}
        <span class="doc-preview-meta-sep" aria-hidden="true">·</span>
        <div class="doc-preview-filename-row">
          <span class="sr-only">{t('mfa.documentFileName')}</span>
          {#if renameEditing}
            <div class="doc-preview-filename-edit">
              <input
                bind:this={renameInputEl}
                class="doc-preview-filename-input"
                class:doc-preview-filename-input--solo={!fileNameParts.extension}
                type="text"
                bind:value={renameDraft}
                maxlength={240}
                disabled={busyAction === 'rename'}
                aria-label={t('mfa.documentFileName')}
                onkeydown={handleRenameKeydown}
                onblur={() => {
                  queueMicrotask(() => {
                    void commitRename();
                  });
                }}
              />
              {#if fileNameParts.extension}
                <span class="doc-preview-filename-ext" aria-hidden="true">{fileNameParts.extension}</span>
              {/if}
            </div>
          {:else}
            <p class="doc-preview-filename-display">
              <span class="doc-preview-filename-base">{fileNameParts.base}</span>{#if fileNameParts.extension}<span class="doc-preview-filename-ext">{fileNameParts.extension}</span>{/if}
            </p>
            {#if canRename}
              <button
                type="button"
                class="icon-btn doc-preview-rename-btn"
                disabled={busyAction != null || previewLoading}
                aria-label={t('mfa.documentRename')}
                onclick={startRename}
              >
                <Pencil size={16} aria-hidden="true" />
              </button>
            {/if}
          {/if}
        </div>
      {/if}
    </div>

    <div class="doc-preview-toolbar-end">
        {#if items.length > 1}
          <div class="doc-preview-pager" aria-label={t('mfa.previewPagerAria')}>
            <button
              type="button"
              class="icon-btn"
              disabled={!canGoPrev || previewLoading || busyAction != null || listLoading || renameEditing}
              aria-label={t('mfa.previewPrevious')}
              onclick={() => switchDocument(activeIndex - 1)}
            >
              <ChevronLeft size={22} aria-hidden="true" />
            </button>
            <span class="doc-preview-pager-label">{activeIndex + 1} / {items.length}</span>
            <button
              type="button"
              class="icon-btn"
              disabled={!canGoNext || previewLoading || busyAction != null || listLoading || renameEditing}
              aria-label={t('mfa.previewNext')}
              onclick={() => switchDocument(activeIndex + 1)}
            >
              <ChevronRight size={22} aria-hidden="true" />
            </button>
          </div>
        {/if}

        <div class="doc-preview-toolbar-actions">
          <Button
            variant="primary"
            size="sm"
            disabled={!canExport || busyAction != null || previewLoading || listLoading || renameEditing}
            loading={busyAction === 'export'}
            onclick={onExport}
          >
            {t('mfa.documentExport')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={busyAction != null || previewLoading || listLoading || renameEditing}
            loading={busyAction === 'discard'}
            onclick={onDiscard}
          >
            {t('mfa.documentDiscard')}
          </Button>
        </div>
        <button
          type="button"
          class="icon-btn doc-preview-close-btn"
          onmousedown={(event) => event.preventDefault()}
          onclick={handleClose}
          aria-label={t('ui.dialogCloseAria')}
        >
          <X size={22} aria-hidden="true" />
        </button>
    </div>
  </header>

  <div class="doc-preview-stage">
    <div class="doc-preview-viewer">
      {#if listLoading || previewLoading}
        <p class="doc-preview-state">{t('mfa.previewLoading')}</p>
      {:else if previewStatusKey}
        <p class="doc-preview-state">{t(`mfa.${previewStatusKey}`)}</p>
      {:else if showPreviewFrame && embedSrc && activeDocument}
        <iframe class="doc-preview-iframe" src={embedSrc} title={activeDocument.fileName}></iframe>
      {:else}
        <p class="doc-preview-state">{t('mfa.previewUnavailable')}</p>
      {/if}
    </div>
  </div>
</Modal>
