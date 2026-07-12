/* eslint-disable svelte/prefer-svelte-reactivity -- internal visitId→count bookkeeping, not UI state */
import { authSession } from '$lib/auth/session-state.svelte';
import { fetchDocumentsForVisit } from '$lib/documents/document-api';
import {
  rememberMfaDocumentContext,
  resolveMfaDocumentContext,
  type MfaPreviewContext,
} from '$lib/mfa/document-context';
import type { QueueItem } from '$lib/queue/types';
import { toastStore } from '$lib/stores/toastStore';
import { t } from '$lib/i18n/i18nStore.svelte';

export const mfaDocumentPreview = $state({
  open: false,
  context: null as MfaPreviewContext | null,
});

let renameGeneration = 0;
let bootstrapInflight: string | null = null;
let bootstrapGeneration = 0;
const queueDocumentCounts = new Map<string, number>();
const SEEN_ZERO_DOCUMENT_COUNT = -1;

function isBootstrapCurrent(generation: number): boolean {
  return generation === bootstrapGeneration;
}

function isMfaAuthenticated(): boolean {
  return authSession.status === 'authenticated' && Boolean(authSession.user?.roles.includes('mfa'));
}

export function invalidateDocumentRename(): void {
  renameGeneration += 1;
}

export function captureRenameGeneration(): number {
  return renameGeneration;
}

export function isRenameGenerationCurrent(generation: number): boolean {
  return generation === renameGeneration;
}

export function openMfaDocumentPreview(
  item: Pick<QueueItem, 'visitId' | 'laneCode' | 'number' | 'topicId' | 'topicLabel'>,
  activeDocumentId = '',
): void {
  const base = {
    visitId: item.visitId,
    laneCode: item.laneCode,
    number: item.number,
    topicId: item.topicId,
    topicLabel: item.topicLabel,
  };
  const context: MfaPreviewContext = { ...base, activeDocumentId };
  rememberMfaDocumentContext(base);
  mfaDocumentPreview.context = context;
  mfaDocumentPreview.open = true;
}

export function closeMfaDocumentPreview(): void {
  const visitId = mfaDocumentPreview.context?.visitId;
  invalidateDocumentRename();
  mfaDocumentPreview.open = false;
  mfaDocumentPreview.context = null;
  if (visitId) {
    queueDocumentCounts.delete(visitId);
  }
}

export function syncMfaDocumentPreviewWithQueue(
  items: readonly Pick<QueueItem, 'visitId' | 'documentCount'>[],
): void {
  if (!mfaDocumentPreview.open || !mfaDocumentPreview.context) {
    return;
  }
  const ctx = mfaDocumentPreview.context;
  const queueItem = items.find((item) => item.visitId === ctx.visitId);
  if (!queueItem) {
    return;
  }
  const prev = queueDocumentCounts.get(ctx.visitId);
  const next = queueItem.documentCount;
  if (next === 0) {
    if (prev === SEEN_ZERO_DOCUMENT_COUNT) {
      closeMfaDocumentPreview();
      return;
    }
    if (prev === undefined) {
      queueDocumentCounts.set(ctx.visitId, SEEN_ZERO_DOCUMENT_COUNT);
      return;
    }
    if (prev > 0) {
      closeMfaDocumentPreview();
      return;
    }
  }
  queueDocumentCounts.set(ctx.visitId, next);
}

function isDeepLinkBootstrapStillActive(visitId: string): boolean {
  if (window.location.pathname !== '/mfa') {
    return false;
  }
  return new URL(window.location.href).searchParams.get('visitId')?.trim() === visitId;
}

export async function bootstrapMfaDocumentPreviewFromUrl(
  pathname: string,
  search: string,
  clearQueryParams: () => void,
): Promise<void> {
  if (pathname !== '/mfa') {
    return;
  }

  const params = new URLSearchParams(search);
  const visitId = params.get('visitId')?.trim();
  const documentId = params.get('documentId')?.trim();
  if (!visitId) {
    return;
  }
  if (mfaDocumentPreview.open) {
    const current = mfaDocumentPreview.context;
    if (current?.visitId === visitId && (!documentId || documentId === current.activeDocumentId)) {
      clearQueryParams();
      return;
    }
    closeMfaDocumentPreview();
  }
  if (bootstrapInflight === search) {
    return;
  }

  const generation = ++bootstrapGeneration;
  bootstrapInflight = search;

  try {
    const context = (await resolveMfaDocumentContext(visitId)) ?? null;
    if (!isBootstrapCurrent(generation)) {
      return;
    }
    if (!context || context.visitId !== visitId) {
      if (!mfaDocumentPreview.open) {
        toastStore.error(t('mfa.documentsContextMissing'));
      }
      clearQueryParams();
      return;
    }

    const result = await fetchDocumentsForVisit(context.visitId);
    if (!isBootstrapCurrent(generation)) {
      return;
    }
    if (!result.ok) {
      if (!mfaDocumentPreview.open) {
        toastStore.error(result.error.message || t('mfa.documentsLoadError'));
      }
      clearQueryParams();
      return;
    }

    const items = result.data.items ?? [];
    if (items.length === 0) {
      clearQueryParams();
      return;
    }

    if (mfaDocumentPreview.open || !isDeepLinkBootstrapStillActive(visitId)) {
      if (isBootstrapCurrent(generation)) {
        clearQueryParams();
      }
      return;
    }

    const activeDocumentId =
      documentId && items.some((item) => item.id === documentId)
        ? documentId
        : (items[0]?.id ?? '');

    if (
      !isMfaAuthenticated() ||
      !isBootstrapCurrent(generation) ||
      !isDeepLinkBootstrapStillActive(visitId)
    ) {
      return;
    }

    openMfaDocumentPreview(context, activeDocumentId);
    clearQueryParams();
  } finally {
    if (isBootstrapCurrent(generation)) {
      bootstrapInflight = null;
    }
  }
}
