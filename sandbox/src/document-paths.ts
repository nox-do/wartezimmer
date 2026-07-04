export function sanitizeSegment(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '_');
  const collapsed = normalized.replace(/_+/g, '_').replace(/^[_ .-]+|[_ .-]+$/g, '');
  return collapsed.length > 0 ? collapsed : 'unknown';
}
