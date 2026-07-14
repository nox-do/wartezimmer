import { mfaAuthFetch } from '$lib/api/cookie-auth-fetch';
import type { QueueItem, QueueResponse } from '$lib/queue/types';

export type MfaDocumentContext = Pick<
  QueueItem,
  'visitId' | 'laneCode' | 'number' | 'topicId' | 'topicLabel'
>;

export type MfaPreviewContext = MfaDocumentContext & {
  activeDocumentId: string;
};

const STORAGE_KEY = 'mfa:document-context';

export function storeMfaDocumentContext(context: MfaDocumentContext): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(context));
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function readMfaDocumentContext(): MfaDocumentContext | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<MfaDocumentContext> & { prefix?: string };
    const number = parseNumber(parsed.number);
    const laneCode = typeof parsed.laneCode === 'string' ? parsed.laneCode : parsed.prefix;
    if (
      typeof parsed.visitId !== 'string' ||
      typeof laneCode !== 'string' ||
      typeof parsed.topicId !== 'string' ||
      number == null
    ) {
      return null;
    }
    return {
      visitId: parsed.visitId,
      laneCode,
      number,
      topicId: parsed.topicId,
      topicLabel: typeof parsed.topicLabel === 'string' ? parsed.topicLabel : '',
    };
  } catch {
    return null;
  }
}

export function rememberMfaDocumentContext(item: MfaDocumentContext): void {
  storeMfaDocumentContext(item);
}

function queueItemToContext(item: QueueItem): MfaDocumentContext {
  return {
    visitId: item.visitId,
    laneCode: item.laneCode,
    number: item.number,
    topicId: item.topicId,
    topicLabel: item.topicLabel,
  };
}

export async function resolveMfaDocumentContext(
  visitIdOverride?: string | null,
): Promise<MfaDocumentContext | null> {
  const visitId =
    visitIdOverride?.trim() ||
    new URL(window.location.href).searchParams.get('visitId')?.trim() ||
    null;
  if (visitId) {
    const result = await mfaAuthFetch<QueueResponse>('/api/v1/queue');
    if (result.ok) {
      const item = result.data.items.find((entry) => entry.visitId === visitId);
      if (item) {
        const context = queueItemToContext(item);
        storeMfaDocumentContext(context);
        return context;
      }
    }

    const stored = readMfaDocumentContext();
    if (stored?.visitId === visitId) {
      return stored;
    }
    return null;
  }

  return readMfaDocumentContext();
}

/** Build `/mfa` search from legacy `/mfa/documents` URL, filling visitId from session when missing. */
export function buildMfaDocumentDeepLinkSearch(rawSearch: string): string {
  const params = new URLSearchParams(rawSearch);
  if (!params.get('visitId')?.trim()) {
    const stored = readMfaDocumentContext();
    if (stored) {
      params.set('visitId', stored.visitId);
    }
  }
  const next = params.toString();
  return next ? `?${next}` : '';
}
