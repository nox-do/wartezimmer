/** Build a Content-Disposition header safe for non-ASCII filenames (RFC 5987). */
export function buildInlineContentDisposition(fileName: string): string {
  const trimmed = fileName.trim() || 'download';
  const asciiFallback =
    trimmed
      // eslint-disable-next-line no-control-regex -- ASCII fallback must not contain header-unsafe chars
      .replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029"\\]/g, '_')
      .replace(/\s+/g, ' ')
      .trim() || 'download';
  const encoded = encodeURIComponent(trimmed).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `inline; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
