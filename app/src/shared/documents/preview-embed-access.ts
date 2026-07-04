import { randomBytes } from 'node:crypto';

type EmbedAccessEntry = {
  previewSessionId: string;
  documentId: string;
  expiresAt: number;
};

const PREVIEW_EMBED_ACCESS_TTL_MS = 15 * 60 * 1000;
const accessTokens = new Map<string, EmbedAccessEntry>();

function purgeExpiredTokens(now = Date.now()): void {
  for (const [token, entry] of accessTokens) {
    if (entry.expiresAt <= now) {
      accessTokens.delete(token);
    }
  }
}

export function revokePreviewEmbedAccessForSession(previewSessionId: string): void {
  purgeExpiredTokens();
  for (const [token, entry] of accessTokens) {
    if (entry.previewSessionId === previewSessionId) {
      accessTokens.delete(token);
    }
  }
}

export function issuePreviewEmbedAccessToken(previewSessionId: string, documentId: string): string {
  purgeExpiredTokens();
  revokePreviewEmbedAccessForSession(previewSessionId);

  const token = randomBytes(32).toString('hex');
  accessTokens.set(token, {
    previewSessionId,
    documentId,
    expiresAt: Date.now() + PREVIEW_EMBED_ACCESS_TTL_MS,
  });
  return token;
}

export function validatePreviewEmbedAccessToken(
  previewSessionId: string,
  documentId: string,
  token: string,
): boolean {
  purgeExpiredTokens();
  const entry = accessTokens.get(token);
  if (!entry) {
    return false;
  }
  if (entry.expiresAt <= Date.now()) {
    accessTokens.delete(token);
    return false;
  }
  return entry.previewSessionId === previewSessionId && entry.documentId === documentId;
}

export function buildSecuredEmbedUrl(
  previewSessionId: string,
  documentId: string,
  sandboxEmbedUrl?: string,
): string {
  const token = issuePreviewEmbedAccessToken(previewSessionId, documentId);
  const basePath =
    sandboxEmbedUrl?.trim() && sandboxEmbedUrl.startsWith('/')
      ? sandboxEmbedUrl.split('?')[0]
      : `/internal/preview/embed/${encodeURIComponent(previewSessionId)}`;
  const params = new URLSearchParams({
    access: token,
    documentId,
  });
  return `${basePath}?${params.toString()}`;
}
