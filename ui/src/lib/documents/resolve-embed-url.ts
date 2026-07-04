/** Resolves sandbox embed paths for iframe src (same-origin via app embed proxy). */
export function resolveSandboxEmbedUrl(embedUrl: string | undefined): string | null {
  const trimmed = embedUrl?.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  if (trimmed.startsWith('/')) {
    return trimmed;
  }
  return null;
}
