/** Existing HTTP names are compatibility data, not an editable networking setting. */
export function persistedHttpHostname(canonical: string | null | undefined): string | null {
  if (!canonical) return null;
  try {
    const url = new URL(canonical);
    if (
      url.protocol !== 'http:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    )
      return null;
    if (/^[0-9.]+$/.test(url.hostname) || url.hostname.includes(':')) return null;
    return url.hostname;
  } catch {
    return null;
  }
}

/** Same derivation for backend persistence and Manager previews. TLS has its own identity path. */
export function deriveHttpDeviceAddress(input: {
  lanIp: string;
  port: number;
  existingCanonical?: string | null;
}): string {
  const host = persistedHttpHostname(input.existingCanonical) || input.lanIp.trim();
  return `http://${host}${input.port === 80 ? '' : `:${input.port}`}`;
}
